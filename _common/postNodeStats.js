'use strict';
var self = postNodeStats;
module.exports = self;

var exec = require('child_process').exec;
var ShippableAdapter = require('./shippable/Adapter.js');
var STATS_PERIOD = 2 * 60 * 1000; // 2 minutes
var os = require('os');
var diskUsage = require('diskusage');

function postNodeStats(params, callback) {
  var bag = {
    params: params,
    isSystemNode: false
  };

  bag.who = util.format('_common|%s|msName:%s', self.name, msName);
  logger.verbose('Validating node status of nodeId: %s',
    config.nodeId);

  async.series([
      _checkInputParams.bind(null, bag),
      _postNodeStatsPeriodically.bind(null, bag)
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

  if (parseInt(global.config.nodeTypeCode) === global.nodeTypeCodes.system)
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

function _postNodeStatsPeriodically(bag, next) {
  var who = bag.who + '|' + _postNodeStatsPeriodically.name;
  logger.debug(who, 'Inside');

  setInterval(
    function() {
      __postNodeStats(bag);
    },
    STATS_PERIOD
  );
  return next();
}

function __postNodeStats(innerBag) {
  var who = innerBag.who + '|' + __postNodeStats.name;
  logger.debug(who, 'Inside');

  async.series([
      __checkActiveContainers.bind(null, innerBag),
      __checkTotalContainers.bind(null, innerBag),
      __checkMemoryUsage.bind(null, innerBag),
      __checkCpuUsage.bind(null, innerBag),
      __checkDiskUsage.bind(null, innerBag),
      __postClusterNodeStat.bind(null, innerBag),
      __postSystemNodeStat.bind(null, innerBag)
    ],
    function(err) {
      if (err)
        logger.warn(
          util.format('Unable to POST node stats with err:%s', err)
        );
    }
  );
}

function __checkActiveContainers(bag, next) {
  var who = bag.who + '|' + __checkActiveContainers.name;
  logger.debug(who, 'Inside');

  var command = 'docker ps| wc -l';
  exec(command,
    function (err, stdout) {
      if (err)
        return next(err);
      bag.activeContainersCount = parseInt(stdout);
      return next();
    }
  );
}

function __checkTotalContainers(bag, next) {
  var who = bag.who + '|' + __checkTotalContainers.name;
  logger.debug(who, 'Inside');

  var command = 'docker ps -a| wc -l';
  exec(command,
    function (err, stdout) {
      if (err)
        return next(err);
      bag.totalContainersCount = parseInt(stdout);
      return next();
    }
  );
}

function __checkMemoryUsage(bag, next) {
  var who = bag.who + '|' + __checkMemoryUsage.name;
  logger.debug(who, 'Inside');

  var totalMem = os.totalmem();
  var freeMem = os.freemem();

  bag.memoryUsageInPercentage = (totalMem - freeMem) * 100 / totalMem;
  return next();
}

function __checkCpuUsage(bag, next) {
  var who = bag.who + '|' + __checkCpuUsage.name;
  logger.debug(who, 'Inside');

  bag.cpuLoadInPercentage = _.first(os.loadavg()) * 100;
  return next();
}

function __checkDiskUsage(bag, next) {
  var who = bag.who + '|' + __checkDiskUsage.name;
  logger.debug(who, 'Inside');

  diskUsage.check('/',
    function(err, info) {
      if (err)
        return next(err);
      var freeDiskInBytes = info.free;
      var totalDiskInBytes = info.total;

      bag.diskUsageInPercentage =
        (totalDiskInBytes - freeDiskInBytes) * 100 /totalDiskInBytes;
      return next();
    }
  );
}

function __postClusterNodeStat(bag, next) {
  if (bag.isSystemNode) return next();

  var who = bag.who + '|' + __postClusterNodeStat.name;
  logger.debug(who, 'Inside');

  var clusterNodeStat = {
    subscriptionId: global.config.subscriptionId,
    activeContainersCount: bag.activeContainersCount,
    totalContainersCount: bag.totalContainersCount,
    memoryUsageInPercentage: bag.memoryUsageInPercentage,
    cpuLoadInPercentage: bag.cpuLoadInPercentage,
    diskUsageInPercentage: bag.diskUsageInPercentage,
    clusterNodeId: global.config.nodeId,
    reportedAt: Date.now()
  };

  bag.adapter.postClusterNodeStats(clusterNodeStat,
    function (err) {
      if (err)
        return next(err);
      return next();
    }
  );
}

function __postSystemNodeStat(bag, next) {
  if (!bag.isSystemNode) return next();

  var who = bag.who + '|' + __postSystemNodeStat.name;
  logger.debug(who, 'Inside');

  var systemNodeStat = {
    activeContainersCount: bag.activeContainersCount,
    totalContainersCount: bag.totalContainersCount,
    memoryUsageInPercentage: bag.memoryUsageInPercentage,
    cpuLoadInPercentage: bag.cpuLoadInPercentage,
    diskUsageInPercentage: bag.diskUsageInPercentage,
    systemNodeId: global.config.nodeId,
    reportedAt: Date.now()
  };

  bag.adapter.postSystemNodeStats(systemNodeStat,
    function (err) {
      if (err)
        return next(err);
      return next();
    }
  );
}
