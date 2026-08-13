const verify = require('./verify');
const warteraum = require('./warteraum');
const giveaway = require('./giveaway');
const counting = require('./counting');
const application = require('./application');
const bewerbungVerwalten = require('./bewerbung-verwalten');
const ticket = require('./ticket');
const admin = require('./admin');

module.exports = [verify, warteraum, giveaway, counting, application, bewerbungVerwalten, ticket, admin];
