'use strict';
var self = validateClusterNode;
module.exports = self;

var fs = require('fs-extra');
var exec = require('child_process').exec;
var ShippableAdapter = require('./shippable/Adapter.js');
var VALIDATION_PERIOD = 2 * 60 * 1000; // 2 minutes

function validateClusterNode(params, callback) {
  if (!config.clusterNodeId)
    return callback();

  var bag = {
    params: params
  };

  bag.who = util.format('_common|%s|msName:%s', self.name, msName);
  logger.verbose('Validating cluster node status of clusterNodeId: %s',
    config.clusterNodeId);

  async.series([
      _checkInputParams.bind(null, bag),
      _validateClusterNodeStatusPeriodically.bind(null, bag)
    ],
    function (err) {
      if (err)
        logger.error(bag.who, 'Failed to validate cluster node status');
      else
        logger.verbose(bag.who, 'Successfully validated cluster node status');
      return callback(err);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  logger.debug(who, 'Inside');

  var consoleErrors = [];
  bag.adapter = new ShippableAdapter('');

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

function __validateClusterNode(innerBag) {
  var who = innerBag.who + '|' + __validateClusterNode.name;
  logger.debug(who, 'Inside');

  innerBag.adapter.validateClusterNodeById(config.clusterNodeId,
    function (err, clusterNode) {
      if (err) {
        logger.warn(who,
          util.format('Failed to :validateClusterNodeById for' +
            'clusterNodeId: %s', config.clusterNodeId), err
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
                config.clusterNodeId, clusterNode.action)
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
        config.clusterNodeId;
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

  exec('sudo docker restart -t=0 shippable-exec-$CLUSTER_NODE_ID',
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

  exec('sudo docker stop -t=0 shippable-exec-$CLUSTER_NODE_ID',
    function(err) {
      if (err)
        logger.error(
          util.format('Failed to stop container with err:%s', err)
        );
      return next(err);
    }
  );
}
