'use strict';

const Constants = require('./constants/constants')

const express = require('express')
const mongoose = require('mongoose')
const axios = require('axios')
const bodyParser = require('body-parser')
const http = require('https')
const RecipeSchema = require('./models/recipe')

let errorResponse = {
    results: []
};

const app = express()

app.use(bodyParser.json())


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
    let queryResult = request.body.queryResult
    let recipeId = request.body.originalDetectIntentRequest.payload.recipeId

    if(recipeId == null){
        recipeId = queryResult.parameters.recipeId     
    }

    if(queryResult.intent.displayName == 'Search recipe'){
       
        findOrDownloadRecipe(recipeId).then(function(recipe){
            return response.json({
                fulfillmentText: "Let's cook " + recipe.title + "! Do you already check that you have all the ingredients or equipment before start cooking?"
            });
        }).catch(function(err){
            return response.json({
                fulfillmentText: "Error, please try again later."
            });
        })
    }

    if(queryResult.intent.displayName == 'List ingredients'){

    }

    if(queryResult.intent.displayName == 'List equipment'){

    }

    //
    //  Recipe info answers
    //
    if(queryResult.intent.displayName == 'Recipe time'){
        console.log(queryResult);

        
    }
});

//Tensorflow flask api proxy
app.post('/classify', (req, res) => {
    console.log("classify food img");
    //call flask
});

app.get('/recipes/:recipeId', (req, res) => {
    findOrDownloadRecipe(req.params.recipeId).then(function(recipe){
        recipe.code = '200';
        return res.json(recipe);
    }).catch(function(err){
        return res.json({
            code: '404',
            message: 'recipe not found'
        });
    })
});
//Regular Rest endpoints

//--------------------FUNCTIONS--------------------------------------

function findOrDownloadRecipe(recipeId){

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


//------------------- RUN SERVER--------------------------------------

const port = 8080

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
