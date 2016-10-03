'use strict';
var self = validateNode;
module.exports = self;

var fs = require('fs-extra');
var exec = require('child_process').exec;
var ShippableAdapter = require('./shippable/Adapter.js');
var VALIDATION_PERIOD = 2 * 60 * 1000; // 2 minutes

function validateNode(params, callback) {
  var bag = {
    params: params,
    isSystemNode: false
  };

  bag.who = util.format('_common|%s|msName:%s', self.name, msName);
  logger.verbose('Validating node status of nodeId: %s',
    config.nodeId);

  async.series([
      _checkInputParams.bind(null, bag),
      _validateClusterNodeStatusPeriodically.bind(null, bag),
      _validateSystemNodeStatusPeriodically.bind(null, bag)
    ],
    function (err) {
      if (err)
        logger.error(bag.who, 'Failed to validate node status');
      else
        logger.verbose(bag.who, 'Successfully validated node status');
      return callback(err);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  logger.debug(who, 'Inside');

  var consoleErrors = [];
  bag.adapter = new ShippableAdapter('');

  if (parseInt(global.config.nodeTypeCode) === global.nodeTypeCodes['system'])
    bag.isSystemNode = true;

  if (consoleErrors.length > 0) {
    _.each(consoleErrors,
      function (e) {
        logger.error(bag.who, e);
      }
    );
    return next(true);
  }
  else return next();
}

function _validateClusterNodeStatusPeriodically(bag, next) {
  if (bag.isSystemNode) return next();
  var who = bag.who + '|' + _validateClusterNodeStatusPeriodically.name;
  logger.debug(who, 'Inside');

  setInterval(
    function() {
      __validateClusterNode(bag);
    },
    VALIDATION_PERIOD
  );
  return next();
}

function _validateSystemNodeStatusPeriodically(bag, next) {
  if (!bag.isSystemNode) return next();
  var who = bag.who + '|' + _validateSystemNodeStatusPeriodically.name;
  logger.debug(who, 'Inside');

  setInterval(
    function() {
      __validateSystemNode(bag);
    },
    VALIDATION_PERIOD
  );
  return next();
}

function __validateClusterNode(innerBag) {
  var who = innerBag.who + '|' + __validateClusterNode.name;
  logger.debug(who, 'Inside');

  innerBag.adapter.validateClusterNodeById(config.nodeId,
    function (err, clusterNode) {
      if (err) {
        logger.warn(who,
          util.format('Failed to :validateClusterNodeById for' +
            'clusterNodeId: %s', config.nodeId), err
        );
      }

      if (clusterNode.action === 'continue')
        innerBag.skipAllSteps = true;
      else
        innerBag.skipAllSteps = false;

      innerBag.action = clusterNode.action;
      innerBag.pidFileLocation = '/var/run/job.pid';
      innerBag.destroyPIDFile = false;

      async.series([
          __readPIDFile.bind(null, innerBag),
          __destroyPIDFile.bind(null, innerBag),
          __restartExecContainer.bind(null, innerBag),
          __stopExecContainer.bind(null, innerBag)
        ],
        function(err) {
          if (err)
            logger.warn(
              util.format('Unable to perform %s with err:%s', innerBag.action,
                err)
            );
          else
            logger.debug(who,
              util.format('clusterNodeId:%s action is %s, doing nothing',
                config.nodeId, clusterNode.action)
            );
        }
      );
    }
  );
}

function __validateSystemNode(innerBag) {
  var who = innerBag.who + '|' + __validateSystemNode.name;
  logger.debug(who, 'Inside');

  innerBag.adapter.validateSystemNodeById(config.nodeId,
    function (err, systemNode) {
      if (err) {
        logger.warn(who,
          util.format('Failed to :validateSystemNodeById for' +
            'systemNodeId: %s', config.nodeId), err
        );
      }

      if (systemNode.action === 'continue')
        innerBag.skipAllSteps = true;
      else
        innerBag.skipAllSteps = false;

      innerBag.action = systemNode.action;
      innerBag.pidFileLocation = '/var/run/job.pid';
      innerBag.destroyPIDFile = false;

      async.series([
          __readPIDFile.bind(null, innerBag),
          __destroyPIDFile.bind(null, innerBag),
          __restartExecContainer.bind(null, innerBag),
          __stopExecContainer.bind(null, innerBag)
        ],
        function(err) {
          if (err)
            logger.warn(
              util.format('Unable to perform %s with err:%s', innerBag.action,
                err)
            );
          else
            logger.debug(who,
              util.format('SystemNodeId:%s action is %s, doing nothing',
                config.nodeId, systemNode.action)
            );
        }
      );
    }
  );
}
function __readPIDFile(bag, next) {
  if (bag.skipAllSteps) return next();

  var who = bag.who + '|' + __readPIDFile.name;
  logger.debug(who, 'Inside');

  fs.readFile(bag.pidFileLocation,
    function(err, data) {
      var shippableExecContainerName = 'shippable-exec-' +
        config.nodeId;
      if (data && data.toString() === shippableExecContainerName)
        bag.destroyPIDFile = true;
      return next();
    }
  );
}

function __destroyPIDFile(bag, next) {
  if (bag.skipAllSteps) return next();
  if (!bag.destroyPIDFile) return next();

  var who = bag.who + '|' + __destroyPIDFile.name;
  logger.debug(who, 'Inside');

  fs.remove(bag.pidFileLocation,
    function(err) {
      if (err)
        logger.warn(who,
          util.format('Failed to delete job.pid file'), err);

      return next();
    }
  );
}

function __restartExecContainer(bag, next) {
  if (bag.skipAllSteps) return next();
  if (bag.action !== 'restart') return next();

  var who = bag.who + __restartExecContainer.name;
  logger.debug(who, 'Inside');

  exec('sudo docker restart -t=0 shippable-exec-$NODE_ID',
    function(err) {
      if (err)
        logger.error(
          util.format('Failed to stop container with err:%s', err)
        );
      return next(err);
    }
  );
}

function __stopExecContainer(bag, next) {
  if (bag.skipAllSteps) return next();
  if (bag.action !== 'shutdown') return next();

  var who = bag.who + __stopExecContainer.name;
  logger.debug(who, 'Inside');

  exec('sudo docker stop -t=0 shippable-exec-$NODE_ID',
    function(err) {
      if (err)
        logger.error(
          util.format('Failed to stop container with err:%s', err)
        );
      return next(err);
    }
  );
}
