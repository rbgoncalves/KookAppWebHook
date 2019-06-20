'use strict';

const Constants = require('./constants/constants')
const intentTypes = require('./constants/intentTypes')
const errorTypes = require('./constants/errorTypes')

const express = require('express')
const multer  = require('multer')
const FormData = require("form-data");
const upload = multer({ dest: 'uploads/'})
const mongoose = require('mongoose')
const axios = require('axios')
const bodyParser = require('body-parser')
const http = require('https')
const RecipeSchema = require('./models/recipe')

let errorResponse = {
    results: []
};

const app = express()

//app.use(bodyParser.json())


//------------SETUP AXIOS-------------------------

let axiosClient = axios.create({
    baseURL: "https://" + Constants.rapidApiHost,
    timeout: 1000,
    headers: {'X-RapidAPI-Host': Constants.rapidApiHost,
              'X-RapidAPI-Key': Constants.rapidApiKey}
  });



//-----------DATABASE----------------------------

let db = require('./config/keys').mongoURI;

// connect to mongoDB
mongoose
  .connect(db, {useNewUrlParser: true})
  .then(() => {
    console.log('MongoDB Connected');
  })
  .catch(err => {
    console.log(err);
    console.log('MongoDB Not Connected');
  });




//-------------API-------------------------------

app.get('/', (req, res) => res.send('KookApp!'))

//Dialogflow webhook
app.post('/kookapp', (request, response) => {

    //If the apikey not valid, return unauthorized
    if(!isApiKeyValid(request)) {
        return response.json({
            fulfillmentText: "Unauthorized."
        });
    }

    
    let queryResult = request.body.queryResult
    let recipeId = request.body.originalDetectIntentRequest.payload.recipeId

    if(recipeId == null){
        recipeId = queryResult.parameters.recipeId     
    }

    findOrDownloadRecipe(recipeId).then(function(recipe){
        //if recipe found, switch dialogflow intents
        let intentResponse = switchIntents(queryResult, recipe);
        //return response
        return response.json(intentResponse);

    }).catch(function(err){
        return response.json({
            fulfillmentText: "Error, please try again later."
        });
    })
});

//Tensorflow flask api proxy
app.post('/predict', upload.single('file'), (req, res, next) => {

    //If the apikey not valid, return unauthorized
    if(!isApiKeyValid(req)) {
        return res.json(errorTypes.unauthorized);
    }

    const form = new FormData();
    form.append("file", req.file);
    
    axios.post('http://localhost:3000/predict', form, {
        headers: {'Content-Type': 'multipart/form-data'}
      })
      .then(function (response) {
        return res.json(response.data)
      })
      .catch(function (error) {
        return res.json(error)
      });
});

app.post('/predict/image', upload.single('file'), (req, res, next) => {

    //If the apikey not valid, return unauthorized
    if(!isApiKeyValid(req)) {
        return res.json(errorTypes.unauthorized);
    }

    const form = new FormData();
    form.append("file", req.file);

    axios({
        method: "post",
        url: "url",
        data: form,
        headers: { ...form.getHeaders() }
    });
    console.log(req);
    
    axios.post('http://localhost:3000/predict/image', {
        file: req.body.file,
      })
      .then(function (response) {
        return res.json(response.data)
      })
      .catch(function (error) {
        return res.json(error)
      });


    
});

//Regular Rest endpoints
app.get('/recipes/:recipeId', (req, res) => {

    
    //If the apikey not valid, return unauthorized
    if(!isApiKeyValid(req)) {
        return res.json(errorTypes.unauthorized);
    }

    findOrDownloadRecipe(req.params.recipeId).then(function(recipe){
        return res.json(recipe);
    }).catch(function(err){
        return res.json(errorTypes.notFound);
    })
});

app.get('/recommendations', (req, res) => {

     //If the apikey not valid, return unauthorized
     if(!isApiKeyValid(req)) {
        return res.json(errorTypes.unauthorized);
    }

    RecipeSchema.find().limit(10)
    .then( (docs => {
        let recommendationsList = [];

        docs.forEach((doc) => {
            recommendationsList.push({
                id: doc.id,
                title: doc.title,
                image: doc.image,
                servings: doc.servings,
                readyInMinutes: doc.readyInMinutes,
                tags: doc.tags
            })
        });

        return res.json(recommendationsList);
    }));
});

//--------------------FUNCTIONS--------------------------------------

function switchIntents(queryResult, recipe) {
    switch (queryResult.intent.displayName) {
        case intentTypes.SearchRecipe:
            return {
                fulfillmentText: "Let's cook " + recipe.title + 
                    "! Do you already check that you have all the ingredients or equipment before start cooking?"
            }
            break;
        case intentTypes.RecipeTime:
            return {
                fulfillmentText: "This recipe takes in average " + recipe.readyInMinutes + " minutes to cook."
            }
            break;
        case intentTypes.RecipeServings:
            return {
                fulfillmentText: "The recipe is for " + recipe.servings + " servings."
            }
            break;
        case intentTypes.RecipeTitle:
            return {
                fulfillmentText: recipe.title
            }
            break;
        case intentTypes.ListIngredients:
            return {

            }
            break;
        default:
            return {
                fulfillmentText: "Sorry, can't understand you."
            }
    }
}

function findOrDownloadRecipe(recipeId) {

    return new Promise(function(resolve, reject){
        RecipeSchema.findOne({id: recipeId})
        .then( (doc) => {  
            if(doc){
                //if mongo already have the recipe
                console.log("recipe document found");
                resolve(doc)
            } else {
                //get recipe from api
                axiosClient.get('/recipes/' +  recipeId + '/information')
                .then(function (res) {
                        console.log("recipe downloaded from api")
                        resolve(saveRecipe(res.data))
                })
                .catch(function (error) {
                        reject(error);
                });
            }    
        })
    })
}


function saveRecipe(recipe){
    let ingredients = recipe.extendedIngredients.map(i => {
        return {
            id: i.id,
            name: i.name,
            amount: i.amount,
            unit: i.unit,
            image: i.image,
            measures: {
                amount: i.measures.metric.amount,
                unitShort: i.measures.metric.unitShort,
                unitLong: i.measures.metric.unitLong
            }
        }
    })

    var uniqEquipments = [];

    recipe.analyzedInstructions[0].steps.forEach(s => {
        s.equipment.forEach(eq => {
            if(uniqEquipments.filter(e => e.id === eq.id).length == 0) {
                uniqEquipments.push(eq)
            }  
        })
    })

    let steps = recipe.analyzedInstructions[0].steps.map(s => {
        return {
            number: s.number,
            step: s.step
        }
    })
    

    var tags = [];

    if(recipe.vegetarian) {
        tags.push("vegetarian")
    }
    if(recipe.glutenFree) {
        tags.push("glutenFree")
    }
    if(recipe.veryHealthy) {
        tags.push("veryHealthy")
    }

    var newRecipe = new RecipeSchema({
        id: recipe.id,
        title: recipe.title,
        image: recipe.image,
        servings: recipe.servings,
        readyInMinutes: recipe.readyInMinutes,
        ingredients: ingredients,
        equipment: uniqEquipments,
        steps: steps,
        tags: tags
    })

    newRecipe.save()

    return newRecipe   
}


function isApiKeyValid(req) {
    //If the apikey from headers doesn't match, return false
    if(req.headers['api-key'] != Constants.apiKey) {
        return false;
    }

    return true;
}

//------------------- RUN SERVER--------------------------------------

const port = 8080

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
