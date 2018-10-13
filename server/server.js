// external modules
const express = require("express");
const bodyParser = require("body-parser");
const _ = require("lodash");
/****************/

//internal modules
var mongoose = require("./db/mongoose");
var User = require("./models/user");
var authenticate = require("./middleware/authenticate");
/****************/

//Routes available
let authRoutes = require("./routes/authRoutes");
let uploadRoutes = require("./routes/uploads");
/****************/

const app = express();
const router = express.Router();

const port = process.env.PORT || 3000;

app.use(bodyParser.json());

app.use("/uploads", express.static("uploads"));
app.use("/auth", authRoutes);
app.use("/upload", uploadRoutes);

app.listen(port, () => {
  console.log(`Server is ready at port ${port}.`);
});
