'use strict';
var self = checkHealth;
module.exports = self;

var checkAMQP = require('./micro/healthChecks/checkAMQP.js');
var checkShippableApi = require('./micro/healthChecks/checkShippableApi.js');
var validateNode = require('./_common/validateNode.js');
var updateNodeStatus = require('./_common/updateNodeStatus.js');
var postNodeStats = require('./_common/postNodeStats.js');

function checkHealth(callback) {
  var bag = {};
  bag.who = util.format('runSh|%s|msName:%s', self.name, msName);
  logger.verbose('Checking health of', bag.who);

  var params = {
    amqpExchange: config.amqpExchange,
    amqpUrl: config.amqpUrl
  };

  async.series([
      checkAMQP.bind(null, params),
      checkShippableApi.bind(null, params),
      updateNodeStatus.bind(null, params),
      validateNode.bind(null, params),
      postNodeStats.bind(null, params)
    ],
    function (err) {
      if (err)
        logger.error(bag.who, 'Failed health checks', err);
      else
        logger.verbose(bag.who, 'Successful health checks');
      return callback(err);
    }
  );
}
