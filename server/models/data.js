//Use to keep results as document in the DB.
const mongoose = require("mongoose");

var DataSchema = new mongoose.Schema({
  image: { type: String },
  link: { type: String },
  itemName: { type: String },
  itemPrice: { type: String },
  rank: { type: Number }
});

var Data = mongoose.model("Data", DataSchema);
module.exports = Data;
