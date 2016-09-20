'use strict';
var self = checkHealth;
module.exports = self;

var checkAMQP = require('./micro/healthChecks/checkAMQP.js');
var checkShippableApi = require('./micro/healthChecks/checkShippableApi.js');
var validateClusterNode = require('./_common/validateClusterNode.js');
var updateClusterNodeStatus = require('./_common/updateClusterNodeStatus.js');

function checkHealth(callback) {
  var bag = {};
  bag.who = util.format('stepExec|%s|msName:%s', self.name, msName);
  logger.verbose('Checking health of', bag.who);

  var params = {
    amqpExchange: config.amqpExchange,
    amqpUrl: config.amqpUrl
  };

  async.series([
      checkAMQP.bind(null, params),
      checkShippableApi.bind(null, params),
      updateClusterNodeStatus.bind(null, params),
      validateClusterNode.bind(null, params)
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
