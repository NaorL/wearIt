var User = require("./../models/user");
const express = require("express");
const _ = require("lodash");
const authenticate = require("./../middleware/authenticate");
const authRoutes = express.Router();

//SignUp - generate token for user, and save it to DB
authRoutes.post("/signup", (req, res) => {
  var body = _.pick(req.body, [
    "email",
    "password",
    "nickname",
    "firstName",
    "lastName"
  ]);
  let recoveryPass = req.body.password;
  body.passwordRecovery = recoveryPass;
  var user = new User(body);
  user
    .save()
    .then(user => {
      return user.generateAuthToken();
    })
    .then(token => {
      //we need to send the token back as an http response header.
      //header takes 2 args (key, value): key = header name, value = the value we want to set the header to.
      //when header name starts with x- it means we are going to send a custom header.
      res
        .header("x-auth", token)
        .status(200)
        .send(user);
    })
    .catch(e => {
      var message = getErrorMessage(e);
      res.status(400).send({ message });
    });
});

//helper function to extract the errors from DB validation
function getErrorMessage(err) {
  if (err) {
    var errors = [];
    if (err.name === "ValidationError") {
      for (field in err.errors) {
        errors.push(err.errors[field].message);
      }
    }
    return errors;
  }
}

//Get user information
authRoutes.get("/me", authenticate, (req, res) => {
  //send back the updated user we got from the method above.
  res.status(200).send(req.user);
});

//Login - generate and return new token without signup
authRoutes.post("/login", (req, res) => {
  var body = _.pick(req.body, ["email", "password", "nickname"]);

  //return because if we had some error, it will handle at the catch case.
  //we generate another token and doesnot return the stored one in order to allow access from multiple devices/locations.
  User.findByCredentials(body.email, body.password, body.nickname)
    .then(user => {
      return user.generateAuthToken().then(token => {
        let result = {
          email: body.email,
          nickname: user.nickname
        };

        res
          .header("x-auth", token)
          .status(200)
          .json(result);
      });
    })
    .catch(e => {
      console.log("Could not get user!");
      res.status(400).send({ message: e.message });
    });
});

//Logout - delete a token
authRoutes.delete("/me/token", authenticate, (req, res) => {
  req.user.removeToken(req.token).then(
    () => {
      res.status(200).send({ message: "OK" });
    },
    () => {
      res.status(400).send({ message: "Error loging out" });
    }
  );
});

//Forgot password - Recover password from DB
authRoutes.post("/forgotPassword", (req, res) => {
  let mail = req.body.email;
  User.findByMail(mail, "password")
    .then(user => {
      if (!user) {
        console.log("could not find user by mail!");
        //reffers the reject to the catch below.
        return Promise.reject();
      }
      res.status(200).send({ passwordRecovery: user.passwordRecovery });
    })
    .catch(e => {
      //401 - Authentication needed
      res
        .status(401)
        .send({ message: "Could not find user with the given mail." });
    });
});

module.exports = authRoutes;
