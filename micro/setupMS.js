'use strict';
var self = setupMS;
module.exports = self;

global.util = require('util');
global._ = require('underscore');
global.async = require('async');

function setupMS(params) {
  global.msName = params.msName;
  process.title = params.msName;
  global.config = {};

  global.config.runMode = process.env.RUN_MODE;
  global.config.logLevel = 'info';
  if (config.runMode === 'dev')
    global.config.logLevel = 'debug';
  else if (config.runMode === 'beta')
    global.config.logLevel = 'verbose';
  else if (config.runMode === 'production')
    global.config.logLevel = 'warn';

  require('./logging/logger.js');
  require('./handleErrors/ActErr.js');

  /* Env Set */
  global.config.amqpExchange = 'shippableEx';
  global.config.apiUrl = process.env.SHIPPABLE_API_URL;
  global.config.inputQueue = process.env.LISTEN_QUEUE;
  global.config.amqpUrl = process.env.SHIPPABLE_AMQP_URL;
  global.config.nodeId = process.env.NODE_ID;
  global.config.subscriptionId = process.env.SUBSCRIPTION_ID;
  global.config.nodeTypeCode = process.env.NODE_TYPE_CODE || 7001;
  global.config.pidFile = '/var/run/job.pid';

  /* Node Type Codes */
  global.nodeTypeCodes = {
    'dynamic' : 7000,
    'custom' : 7001,
    'system' : 7002
  };
}
