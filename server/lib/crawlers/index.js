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
// New crawlers
const mule = require("./mule");
const playdb = require("./playdb");
const themusical = require("./themusical");
const artjob = require("./artjob");
const arko = require("./arko");
const munjang = require("./munjang");
const kopis = require("./kopis");
const culture = require("./culture");
const castingdb = require("./castingdb");
const danceinfo = require("./danceinfo");

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
  // New crawlers
  mule,
  playdb,
  themusical,
  artjob,
  arko,
  munjang,
  kopis,
  culture,
  castingdb,
  danceinfo,
];

module.exports = { ALL_CRAWLERS };
