const User = require("./../models/user");

/*middleware function - use as part of path access procees
Adds the actual user from DB into request body.*/
var authenticate = (req, res, next) => {
  //getting the header value. all we need is to pass in the key.
  var token = req.header("x-auth");

  //model method
  User.findByToken(token)
    .then(user => {
      if (!user) {
        console.log("could not find user by token!");
        //reffers the reject to the catch below.
        return Promise.reject();
      }

      req.user = user;
      req.token = token;
      next();
    })
    .catch(e => {
      //401 - Authentication needed
      res.status(401).send({ message: "User authentication failed." });
    });
};

module.exports = authenticate;
