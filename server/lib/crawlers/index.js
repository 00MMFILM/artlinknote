const filmmakers = require("./filmmakers");
const plfil = require("./plfil");
const castingnara = require("./castingnara");
const otr = require("./otr");
const contestkorea = require("./contestkorea");
const artnuri = require("./artnuri");
const artnet = require("./artnet");
const kofic = require("./kofic");
const artculture = require("./artculture");
const artmore = require("./artmore");
const cine21 = require("./cine21");
const wevity = require("./wevity");

const ALL_CRAWLERS = [
  filmmakers,
  plfil,
  castingnara,
  otr,
  contestkorea,
  artnuri,
  artnet,
  kofic,
  artculture,
  artmore,
  cine21,
  wevity,
];

module.exports = { ALL_CRAWLERS };
