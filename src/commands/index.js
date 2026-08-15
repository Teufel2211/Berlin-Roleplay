const verify = require('./verify');
const warteraum = require('./warteraum');
const giveaway = require('./giveaway');
const application = require('./application');
const bewerbungVerwalten = require('./bewerbung-verwalten');
const ticket = require('./ticket');
const admin = require('./admin');
const interview = require('./interview');
const team = require('./team');
const moderation = require('./moderation');

module.exports = [verify, warteraum, giveaway, application, bewerbungVerwalten, ticket, admin, interview, team, moderation];
