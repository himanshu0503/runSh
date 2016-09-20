'use strict';
var self = inStep;
module.exports = self;

var path = require('path');

function inStep(externalBag, dependency, buildInDir, callback) {
  var bag = {};

  bag.who = 'runSh|_common|resources|trigger|' + self.name;
  logger.verbose(bag.who, 'Starting');

  return callback();
}
