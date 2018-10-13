const express = require("express");
const uploadRoutes = express.Router();
const multer = require("multer");
const path = require("path");
const authenticate = require("./../middleware/authenticate");
const fs = require("fs");
const _ = require("lodash");
const axios = require("axios");
const cheerio = require("cheerio");
const async = require("async");
const asinMatcher = require("asin-matcher");
const OperationHelper = require("apac").OperationHelper;
const convertCurrency = require("nodejs-currency-converter");
const fx = require("money");
const Favorites = require("./../models/data");

//Enums of the available domains
const DOMAINS = {
  AMAZON: "www.amazon.com",
  EBAY: "www.ebay.com",
  ALI: "www.aliexpress.com"
};
//Ranks for products
const RANKS = {
  ZERO: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5
};

//Set deafault response to prevent cache saving
function nocache(req, res, next) {
  res.header("User-Agent", "Chrome/60.0.3112.113");
  res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
  res.header("Expires", "-1");
  res.header("Pragma", "no-cache");
  next();
}

//Get AliExpress body and link as parameters.
//Return the matching item after web scrape the data from the given link.
function handleAliDomain($, link) {
  let price,
    minPrice = -1,
    maxPrice = -1,
    rank;
  let priceSpan = $("span#j-sku-discount-price");
  //If there are no children, there is no price range so just extract and return
  let priceSpanChildren = priceSpan.children();
  if (priceSpanChildren.length !== 0) {
    minPrice = priceSpanChildren.eq(0).text();
    maxPrice = priceSpanChildren.eq(1).text();
    price = minPrice + " - " + maxPrice;
  } else {
    price = priceSpan.text();
  }

  rank = $(".percent-num").text();
  if (rank === "") {
    rank = 0;
  }
  rank = parseFloat(rank);

  var imageFromBodyUrl = $("div.ui-image-viewer-thumb-wrap")
    .find("img")
    .attr("src");

  var itemName = $("h1.product-name").text();
  var result = {
    image: imageFromBodyUrl,
    link: link,
    itemName: itemName,
    itemPrice: price,
    rank: rank
  };

  return result;
}

//Set a rank (0-5) by value of percentage
function getRank(percentage) {
  if (percentage >= 80) return RANKS.FIVE;
  else if (percentage >= 60) return RANKS.FOUR;
  else if (percentage >= 40) return RANKS.THREE;
  else if (percentage >= 20) return RANKS.TWO;
  else if (percentage > 0) return RANKS.ONE;
  else return RANKS.ZERO;
}

//Get Ebay body and link as parameters.
//Return the matching item after web scrape the data from the given link.
async function handleEbayDomain($, link) {
  let price = "";
  let itemName = "";
  let imageFromBodyUrl = "";
  let rank = 0;
  let result;
  let container = $("div#prcIsum-lbl").next();
  let priceFromBody = container.find("span.notranslate ").text();
  //Its not a product page
  if (priceFromBody !== "") {
    imageFromBodyUrl = $("img#icImg").attr("src");
    itemName = $("h1#itemTitle").text();
    let rankFromBody = $("#si-fb").text();
    let priceStr = priceFromBody.split(" ");
    let cleanPrice = priceStr[1].replace(
      /[`~!@#$%^&*()_|+\-=?;:'",<>\{\}\[\]\\\/]/gi,
      ""
    );
    rank = rankFromBody.split("%")[0];
    rank = getRank(parseFloat(rank));

    let url;
    try {
      switch (priceStr[0]) {
        case "US":
          price = cleanPrice;
          break;
        case "C":
          from = "cad";
          price = await updateFixerURL(from, cleanPrice);
          break;
        case "GBP":
          from = "gbp";
          price = await updateFixerURL(from, cleanPrice).then(
            res => (price = res)
          );
          break;
        case "EUR":
          from = "eur";
          price = await updateFixerURL(from, cleanPrice);
          break;
        case "AU":
          from = "aud";
          price = await updateFixerURL(from, cleanPrice);
          break;
      }
    } catch (err) {
      console.log("err.message");
    }
  }

  result = {
    image: imageFromBodyUrl,
    link: link,
    itemName: itemName,
    itemPrice: price,
    rank: rank
  };

  return result;
}

//Get converted currency value
async function updateFixerURL(from, price) {
  let res;
  let url =
    "https://transferwise.com/gb/currency-converter/" +
    from +
    "-to-usd-rate?amount=" +
    price;

  try {
    let body = await axios(url);
    let $ = cheerio.load(body.data);
    res = $("#cc-amount-to").attr("value");
  } catch (err) {
    console.log("err.message");
    res = "-1";
  }

  return res;
}

//Get Amazon body and link as parameters.
//Return the matching item after web scrape the data from the given link.
function handleAmazonDomain($, link) {
  let minPrice,
    imageFromBodyUrl = "",
    itemName = "",
    price = "";
  let result;
  let rank = 0;
  let priceFromBody = $("span#priceblock_ourprice.a-color-price").text();
  if (priceFromBody !== "") {
    imageFromBodyUrl = $("#landingImage").attr("data-old-hires");
    let rankFromBody = $("#acrPopover").attr("title");
    itemName = $("span#productTitle.a-size-large")
      .text()
      .trim();
    let cleanPrice = priceFromBody.replace(
      /[`~!@#$%^&*()_|+\-=?;:'",<>\{\}\[\]\\\/]/gi,
      ""
    );
    rank = parseFloat(rankFromBody.split(" ")[0]);
    let prices = cleanPrice.split("  ");
    minPrice = prices[0];
    if (prices.length < 2) {
      price = minPrice;
    } else {
      price = minPrice + " - " + prices[1];
    }
  }

  result = {
    image: imageFromBodyUrl,
    link: link,
    itemName: itemName,
    itemPrice: price,
    rank: rank
  };

  return result;
}

//Extract body from given URL and act according to domain
async function getItemsInfo(itemsArr) {
  return itemsArr.map(async item => {
    try {
      var body = await axios(item.link);
      var $ = cheerio.load(body.data);
      //Extract data by domain
      switch (item.displayLink) {
        case DOMAINS.AMAZON:
          return handleAmazonDomain($, item.link);
        case DOMAINS.EBAY:
          return handleEbayDomain($, item.link);
        case DOMAINS.ALI:
          return handleAliDomain($, item.link);
        default:
          return "No supported domain";
      }
    } catch (err) {
      console.log(err.message);
      return "";
    }
  });
}

//Comparing function
function compareByPrice(item1, item2) {
  let price1 = parseFloat(item1.itemPrice);
  let price2 = parseFloat(item2.itemPrice);
  if (price1 < price2) {
    return -1;
  }
  if (price1 > price2) {
    return 1;
  }
  return 0;
}

//Comparing function
function compareByRank(item1, item2) {
  let rank1 = parseFloat(item1.rank);
  let rank2 = parseFloat(item2.rank);
  let price1 = parseFloat(item1.itemPrice);
  let price2 = parseFloat(item2.itemPrice);
  if (rank1 < rank2) {
    return 1;
  }
  if (rank1 > rank2) {
    return -1;
  }
  if (price1 > price2) {
    return -1;
  }
  return 0;
}

//Get google image serach results and proccess it.
//Return the most relevance results sorted by price and rank.
uploadRoutes.post(
  "/processGoogleSearchData",
  authenticate,
  nocache,
  (req, res) => {
    //Assuming getting in req.body the google result JSON as "googleSearchResult"
    let googleItemsArr = [];
    let itemsArr = [];
    let googleResult;
    let user = req.user;
    googleItemsArr = req.body.googleSearchResult.items;
    if (googleItemsArr.length === 0) {
      return res.status(400).send({ message: "No data sent to server" });
    }

    itemsArr = _.map(googleItemsArr, function(item) {
      return _.pick(item, "displayLink", "link");
    });

    getItemsInfo(itemsArr)
      .then(promisesArr => Promise.all(promisesArr))
      .then(resultData => {
        if (resultData.length !== 0) {
          resultData = resultData.filter(
            item => item !== "" && item.itemName !== ""
          );
          if (resultData.length !== 0) {
            let resultByRank = new Array();
            for (var i = 0; i < resultData.length; i++) {
              resultByRank.push(Object.assign({}, resultData[i]));
            }
            resultData.sort(compareByPrice);
            resultByRank.sort(compareByRank);
            for (i = 0; i < resultData.length; i++) {
              if (i === 0) {
                let temp = {};
                Object.assign(temp, resultData[i]);
                Favorites.find({}, function(err, favoriteArray) {
                  if (err) {
                    console.log(err.message);
                  }
                  if (!favoriteArray.some(e => e.link === temp.link)) {
                    let newItem = new Favorites(temp);
                    newItem.save(function(err, result) {
                      if (err) return console.error(err);
                    });
                  }
                });
              }

              resultData[i].itemPrice += "$";
              resultByRank[i].itemPrice += "$";
            }
            googleResult = {
              googleResultSortedByPrice: resultData,
              googleResultSortedByRank: resultByRank
            };

            return res.status(200).send(googleResult);
          }
        }
        googleResult = {
          googleResultSortedByPrice: [],
          googleResultSortedByRank: []
        };
        return res.status(200).send(googleResult);
      })
      .catch(err => {
        console.log(err);
        return res.status(400).send(err.message);
      });
  }
);

//Return the items people searched for
uploadRoutes.get("/favorites", authenticate, (req, res) => {
  Favorites.find({}, function(err, result) {
    if (err) {
      return res.status(400).send({ error: err.message });
    } else {
      return res.status(200).send({ favorites: result });
    }
  });
});

//Get the user choices and save it to it's history
uploadRoutes.post("/history", authenticate, (req, res) => {
  let user = req.user;
  let itemToAdd = {
    image: req.body.image,
    link: req.body.link,
    itemName: req.body.itemName,
    itemPrice: req.body.itemPrice,
    rank: req.body.rank
  };
  user.uploads.push(itemToAdd);
  user.save().then(
    () => {
      res.status(200).send({ message: "OK" });
    },
    () => {
      res.status(400).send({ message: "Error saving history" });
    }
  );
});

//Return the user choices.
uploadRoutes.get("/history", authenticate, (req, res) => {
  let user = req.user;
  res.status(200).send(user.uploads);
});

module.exports = uploadRoutes;
