'use strict';
var checkHealth = require('./checkHealth.js');
var microWorker = require('./microWorker.js');
var runShMS = require('./micro/MicroService.js');
var setupMS = require('./micro/setupMS.js');

var msParams = {
  checkHealth: checkHealth,
  microWorker: microWorker
};

var params = {
  msName: 'runSh'
};

var consoleErrors = [];
setupMS(params);

var who = util.format('msName:%s', msName);
logger.info(util.format('Checking system config for %s', who));

if (!global.config.amqpUrl)
  consoleErrors.push(util.format('%s is missing: amqpUrl', who));

if (!global.config.amqpExchange)
  consoleErrors.push(util.format('%s is missing: amqpExchange', who));

if (!global.config.apiUrl)
  consoleErrors.push(util.format('%s is missing: apiUrl', who));

if (!global.config.inputQueue)
  consoleErrors.push(util.format('%s is missing: inputQueue', who));

if (!global.config.nodeId)
  consoleErrors.push(util.format('%s is missing: nodeId', who));

if (!global.config.nodeTypeCode)
  consoleErrors.push(util.format('%s is missing: nodeTypeCode', who));

if (consoleErrors.length > 0) {
  _.each(consoleErrors, function (err) {
      logger.error(who, err);
    }
  );
  return process.exit(1);
}

logger.info(util.format('system config checks for %s succeeded', who));

// This is where micro service starts
runShMS = new runShMS(msParams);
