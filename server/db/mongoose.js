/*Set mongoose model as the storage managment model */

const mongoose = require("mongoose");

mongoose.Promise = global.Promise;

let connection;

if (!process.env.MONGODB_URI) {
  connection = "mongodb://localhost:27017/WearIt";
} else {
  connection = process.env.MONGODB_URI;
}

mongoose
  .connect(connection)
  .then(() => {
    console.log("connected!");
  })
  .catch(err => {
    console.log("Unable to connect Mongo.");
  });

module.exports = { mongoose };
