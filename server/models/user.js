//Uses to keep user in DB with the follow documents
const mongoose = require("mongoose");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const _ = require("lodash");
const bcrypt = require("bcryptjs");

var UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    minlength: 1,
    trim: true,
    unique: true,
    validate: {
      validator: validator.isEmail,
      message: `Email address is not a valid email`
    }
  },
  nickname: {
    type: String,
    minlength: 1,
    trim: true
  },
  firstName: {
    type: String,
    minlength: 1,
    trim: true
  },
  lastName: {
    type: String,
    minlength: 1,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 4
  },
  passwordRecovery: {
    type: String,
    required: true,
    minlength: 4
  },
  tokens: [
    {
      access: {
        type: String,
        required: true
      },
      token: {
        type: String,
        required: true
      }
    }
  ],
  uploads: [
    {
      image: { type: String },
      link: { type: String },
      itemName: { type: String },
      itemPrice: { type: String },
      rank: { type: Number }
    }
  ]
});
//Generate a new user token
UserSchema.methods.generateAuthToken = function() {
  var user = this;
  var access = "auth";
  let salt = process.env.SALT || "123";
  //Reminder: the first argument is the data we want to sign, and the second argument is the secret value
  var token = jwt
    .sign({ _id: user._id.toHexString(), access }, salt)
    .toString();
  user.tokens.push({ access, token });

  return user.save().then(() => {
    return token;
  });
};

//set the return value of the JSON object to contain only the _id and the user email.
UserSchema.methods.toJSON = function() {
  var user = this;
  var userObject = user.toObject();

  return _.pick(userObject, ["_id", "email"]);
};

//delete a user token - logout
UserSchema.methods.removeToken = function(token) {
  var user = this;

  //pull allow us to remove items from an array that match certain criteria.
  return user.update({
    $pull: {
      tokens: {
        token: token
      }
    }
  });
};

//getting current user id
UserSchema.methods.getUserID = function() {
  var user = this;
};

//Static allow us to define the method as model method and not instance method.
//Return the uesr with the given token
UserSchema.statics.findByToken = function(token) {
  //instance user get called with an individual document.
  //model method get called  with the model as this.
  var User = this;
  var decoded;

  try {
    decoded = jwt.verify(token, "abc123");
  } catch (e) {
    return Promise.reject();
  }

  //in success case, return a promise
  //our way to access inner objects is with the string of the path
  return User.findOne({
    _id: decoded._id,
    "tokens.token": token,
    "tokens.access": "auth"
  });
};
//Return the uesr with the given credentials
UserSchema.statics.findByCredentials = function(email, password, nickname) {
  var User = this;
  try {
    return User.findOne({ email }).then(user => {
      //if the user does not exist continue in the catch case.
      if (!user) {
        return Promise.reject(new Error("Could not find user email!"));
      }
      return new Promise((resolve, reject) => {
        bcrypt.compare(password, user.password, (err, res) => {
          if (res) {
            console.log(user);

            resolve(user);
          } else {
            reject(new Error("Incorrect password"));
          }
        });
      });
    });
  } catch (err) {
    console.log(err.message);
  }
};
//Return the uesr with the given mail
UserSchema.statics.findByMail = function(email) {
  var User = this;
  return User.findOne({ email }).then(user => {
    //if the user does not exist continue in the catch case.
    if (!user) {
      return Promise.reject(new Error("Could not find user email!"));
    }

    return new Promise((resolve, reject) => {
      resolve(user);
    });
  });
};

//Using mongoose middleware to check authentication before we save to DB
UserSchema.pre("save", function(next) {
  var user = this;
  //we want to check if the password was modified.
  //once the password was hashed we dont want to hash the hash.
  //hence if the password was not modified we skip the pre content.
  if (user.isModified("password")) {
    bcrypt.genSalt(10, (err, salt) => {
      bcrypt.hash(user.password, salt, (err, hash) => {
        user.password = hash;
        next();
      });
    });
  } else {
    next();
  }
});

var User = mongoose.model("User", UserSchema);

module.exports = User;
