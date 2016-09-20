'use strict';
var self = updateClusterNodeStatus;
module.exports = self;

var fs = require('fs-extra');
var ShippableAdapter = require('./shippable/Adapter.js');
var statusCodes = require('./statusCodes.js');

function updateClusterNodeStatus(params, callback) {
  if (!config.clusterNodeId)
    return callback();

  var bag = {
    params: params,
    pidFileLocation: '/var/run/job.pid',
    skipStatusUpdate: false
  };

  bag.who = util.format('_common|%s|msName:%s', self.name, msName);
  logger.verbose('Updating updateClusterNodeStatus of %s',
    config.clusterNodeId);

  async.series([
      _checkInputParams.bind(null, bag),
      _checkPIDFile.bind(null, bag),
      _updateClusterNodeStatus.bind(null, bag)
    ],
    function (err) {
      if (err)
        logger.error(bag.who, 'Failed to update cluster node status');
      else
        logger.verbose(bag.who, 'Successfully updated cluster node status');
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
  if (bag.skipStatusUpdate) return next();

  var who = bag.who + '|' + _updateClusterNodeStatus.name;
  logger.debug(who, 'Inside');

  var update = {
    status: statusCodes.SUCCESS
  };

  bag.adapter.putClusterNodeById(config.clusterNodeId,
    update,
    function (err) {
      if (err) {
        logger.error(
          util.format('%s has failed to update status of cluster node %s' +
            'with err %s', who, config.clusterNodeId, err)
        );
        return next(true);
      }
      return next();
    }
  );
}
