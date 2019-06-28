'use strict';

const Constants = require('./constants/constants')
const intentTypes = require('./constants/intentTypes')
const errorTypes = require('./constants/errorTypes')

const express = require('express')
const mongoose = require('mongoose')
const axios = require('axios')
const bodyParser = require('body-parser')
const fs = require('fs')
const https = require('https')
const http = require('http');
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

    //If the apikey not valid, return unauthorized
    if(!isApiKeyValid(request)) {
        return response.json({
            fulfillmentText: "Unauthorized."
        });
    }

    
    let queryResult = request.body.queryResult
    let recipeId = request.body.originalDetectIntentRequest.payload.recipeId
    let currentStepNr = request.body.originalDetectIntentRequest.payload.stepNr
    

    if(recipeId == null){
        recipeId = queryResult.parameters.recipeId     
    }

    findOrDownloadRecipe(recipeId).then(function(recipe){
        //if recipe found, switch dialogflow intents
        let intentResponse = switchIntents(queryResult, recipe, currentStepNr);
        //return response
        return response.json(intentResponse);

    }).catch(function(err){
        console.log(err);
        
        return response.json({
            fulfillmentText: "Error, please try again later."
        });
    })
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

function switchIntents(queryResult, recipe, currentStepNr) {
    let step;

    console.log(queryResult.intent.displayName);
    

    switch (queryResult.intent.displayName) {
        case intentTypes.SearchRecipe:
            return {
                fulfillmentText: "Let's cook " + recipe.title + 
                    "! Do you already check that you have all the ingredients or equipment before start cooking?",
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
            let ingredients = "";
            recipe.ingredients.forEach((i) => {
                ingredients += "• " + i.amount + " " + i.unit + " " + i.name + "\n";
            })
            return {
                fulfillmentText: "Here are the ingredients that you need: \n\n" + ingredients,
            }
            break;
        case intentTypes.ListEquipment:
            let equipment = "";
            recipe.equipment.forEach((e) => {
                equipment += "• " + e.name+ "\n";
            })
            return {
                fulfillmentText: "Equipment list: \n\n" + equipment,
            }
            break;
        case intentTypes.StartCooking:
            if(currentStepNr != 0) {
                return {
                    fulfillmentText: "You have already started the recipe."
                }
            }
            step = getNextStep(recipe, currentStepNr)
            return {
                fulfillmentText: step.step,
                payload: {
                    stepNr: ++currentStepNr
                }
            }
            break;
        case intentTypes.NextStep:
            //If the user is currently on the last step
            if(currentStepNr == recipe.steps.length){
                return {
                    fulfillmentText: "Congrats, you've conclude this recipe! Do you have any question?",
                    payload: {
                        stepNr: 0
                    }
                }
            }
            step = getNextStep(recipe, currentStepNr)
            return {
                fulfillmentText: step.step,
                payload: {
                    stepNr: ++currentStepNr
                }
            }
            break;
        case intentTypes.PreviousStep:
            //if the user is currently on the first step
            if(currentStepNr == 1){
                return {
                    fulfillmentText: "There are no previous steps, we just started right now!"
                }
            }
            step = getPreviousStep(recipe, currentStepNr)
            return {
                fulfillmentText: step.step,
                payload: {
                    stepNr: --currentStepNr
                }
            }    
            break;
        case intentTypes.RepeatStep:       
            let stepNrToRepeat = currentStepNr - 1;
            return {
                fulfillmentText: recipe.steps[stepNrToRepeat].step
            }
            break;
        case intentTypes.IsVegetarian:
            let msg;
            if(recipe.tags.some(t => t == 'vegan')){
                msg = "This recipe is vegan."
            } else if(recipe.tags.some(t => t == 'vegetarian')) {
                msg = "This is a vegetarian recipe."
            } else {
                msg = "Nop, this recipe is not vegetarian."
            }
            return {
                fulfillmentText: msg
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

function getNextStep(recipe, currentStepNr) {
    return recipe.steps[currentStepNr++]
}

function getPreviousStep(recipe, currentStepNr) {
    console.log(currentStepNr);
    
    return recipe.steps[currentStepNr-2]
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

    if(recipe.vegan) {
        tags.push("vegan")
    }
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

const httpServer = http.createServer(app);
const httpsServer = https.createServer({
    key: fs.readFileSync('./https/key.pem'),
    cert: fs.readFileSync('./https/cert.pem'),
    passphrase: Constants.passphrase
}, app);

httpServer.listen(8080, () => {
	console.log('Kookapp webhook running on port 8080');
});

httpsServer.listen(8443, () => {
	console.log('HTTPS Server running on port 443');
});
