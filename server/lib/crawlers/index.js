const filmmakers = require("./filmmakers");
const plfil = require("./plfil");
const castingnara = require("./castingnara");
const otr = require("./otr");
const contestkorea = require("./contestkorea");
const artnuri = require("./artnuri");

const ALL_CRAWLERS = [
  filmmakers,
  plfil,
  castingnara,
  otr,
  contestkorea,
  artnuri,
];

module.exports = { ALL_CRAWLERS };
