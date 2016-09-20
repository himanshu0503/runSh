'use strict';
var checkHealth = require('./checkHealth.js');
var microWorker = require('./microWorker.js');
var stepExecMS = require('./_common/micro/MicroService.js');
var setupMS = require('../_global/setupMS.js');
var setupStepExec = require('./_common/setupStepExec.js');

var msParams = {
  checkHealth: checkHealth,
  microWorker: microWorker
};

var params = {
  msName: 'stepExec'
};

var consoleErrors = [];
setupMS(params);
setupStepExec();

var who = util.format('stepExec|msName:%s', msName);
logger.info(util.format('Checking system config for %s', who));

if (!global.config.amqpUrl)
  consoleErrors.push(util.format('%s is missing: amqpUrl', who));

if (!global.config.amqpExchange)
  consoleErrors.push(util.format('%s is missing: amqpExchange', who));

if (!global.config.apiUrl)
  consoleErrors.push(util.format('%s is missing: apiUrl', who));

if (!global.config.jobType)
  consoleErrors.push(util.format('%s is missing: jobType', who));

if (consoleErrors.length > 0) {
  _.each(consoleErrors, function (err) {
      logger.error(who, err);
    }
  );
  return process.exit(1);
}

logger.info(util.format('system config checks for %s succeeded', who));

// This is where micro service starts
stepExecMS = new stepExecMS(msParams);
