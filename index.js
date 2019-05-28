'use strict';

const rapidApiHost = 'spoonacular-recipe-food-nutrition-v1.p.rapidapi.com';
const rapidApiKey = '39d27d6409mshbc42439639330eep198360jsn6727296f5ee8';

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
    baseURL: "https://" + rapidApiHost,
    timeout: 1000,
    headers: {'X-RapidAPI-Host': rapidApiHost,
              'X-RapidAPI-Key': rapidApiKey}
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

app.post('/kookapp', (request, response) => {
    let queryResult = request.body.queryResult;

    if(queryResult.intent.displayName == 'Search recipe'){
        let recipeId = queryResult.parameters.recipeId

        
        let recipe = null;
        
        RecipeSchema.findOne({id: recipeId})
            .then( (doc) => {
                
                if(doc){
                    //if mongo already have the recipe
                    recipe = doc
                    console.log("recipe document found");
                } else {
                    //get recipe from api
                    axiosClient.get('/recipes/' +  recipeId + '/information')
                    .then(function (res) {
                            console.log("recipe downloaded from api")
                            
                            recipe = saveRecipe(res.data)
                    })
                    .catch(function (error) {
                            console.log(error);
                    });
                }
                
                return response.json({
                    fulfillmentText: "Let's cook " + recipe.title + "! Do you already check that you have all the ingredients or equipment before start cooking?"
                });
            })
    }
    
});

app.post('/classify', (req, res) => {
    console.log("classify food img");
    //call flask
});

//--------------------FUNCTIONS--------------------------------------


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
