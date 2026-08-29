const giveaway = require('./giveaway');
const ticket = require('./ticket');
const ban = require('./ban');
const unban = require('./unban');
const kick = require('./kick');
const softban = require('./softban');
const warn = require('./warn');
const unwarn = require('./unwarn');
const warnlist = require('./warnlist');
const warndelete = require('./warndelete');
const clear = require('./clear');
const cases = require('./cases');
const caseCmd = require('./case');
const panel = require('./panel');

module.exports = [giveaway, ticket, ban, unban, kick, softban, warn, unwarn, warnlist, warndelete, clear, cases, caseCmd, panel];