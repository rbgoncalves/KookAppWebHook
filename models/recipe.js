let mongoose = require('mongoose')

let recipeSchema = mongoose.Schema({
    id: Number,
    title: String,
    image: String,
    servings: Number,
    readyInMinutes: Number,
    ingredients: [{
        id: Number,
        name: String,
        amount: Number,
        unit: String,
        image: String,
        measures: {
            amount: Number,
            unitShort: String,
            unitLong: String
        }
    }],
    equipment: [{
        id: Number,
        name: String,
        image: String
    }],
    steps: [{
        number: Number,
        step: String
    }],
    tags: [String]
})


module.exports = mongoose.model('recipe', recipeSchema)
 