'use strict';
var self = updateNodeStatus;
module.exports = self;

var fs = require('fs-extra');
var ShippableAdapter = require('./shippable/Adapter.js');
var statusCodes = require('./statusCodes.js');

function updateNodeStatus(params, callback) {
  var bag = {
    params: params,
    pidFileLocation: '/var/run/job.pid',
    skipStatusUpdate: false,
    isSystemNode: false
  };

  bag.who = util.format('_common|%s|msName:%s', self.name, msName);
  logger.verbose('Updating updateNodeStatus of %s',
    config.nodeId);

  async.series([
      _checkInputParams.bind(null, bag),
      _checkPIDFile.bind(null, bag),
      _updateClusterNodeStatus.bind(null, bag),
      _updateSystemNodeStatus.bind(null, bag)
    ],
    function (err) {
      if (err)
        logger.error(bag.who, 'Failed to update node status');
      else
        logger.verbose(bag.who, 'Successfully updated node status');
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

function _checkPIDFile(bag, next) {
  var who = bag.who + '|' + _checkPIDFile.name;
  logger.debug(who, 'Inside');

  fs.exists(bag.pidFileLocation,
    function(exists) {
      if (exists) {
        logger.warn(who,
          util.format('PID file already exists, skipping status update'));
        bag.skipStatusUpdate = true;
      }
      return next();
    }
  );
}

function _updateClusterNodeStatus(bag, next) {
  if (bag.isSystemNode) return next();
  if (bag.skipStatusUpdate) return next();

  var who = bag.who + '|' + _updateClusterNodeStatus.name;
  logger.debug(who, 'Inside');

  var update = {
    status: statusCodes.SUCCESS
  };

  bag.adapter.putClusterNodeById(config.nodeId,
    update,
    function (err) {
      if (err) {
        logger.error(
          util.format('%s has failed to update status of cluster node %s' +
            'with err %s', who, config.nodeId, err)
        );
        return next(true);
      }
      return next();
    }
  );
}

function _updateSystemNodeStatus(bag, next) {
  if (!bag.isSystemNode) return next();
  if (bag.skipStatusUpdate) return next();

  var who = bag.who + '|' + _updateSystemNodeStatus.name;
  logger.debug(who, 'Inside');

  var update = {
    status: statusCodes.SUCCESS
  };

  bag.adapter.putSystemNodeById(config.nodeId,
    update,
    function (err) {
      if (err) {
        logger.error(
          util.format('%s has failed to update status of system node %s' +
            'with err %s', who, config.nodeId, err)
        );
        return next(true);
      }
      return next();
    }
  );
}
