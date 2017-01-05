'use strict';
var self = microWorker;
module.exports = self;

var Adapter = require('./_common/shippable/Adapter.js');
var BuildJobConsoleAdapter = require('./_common/buildJobConsoleAdapter.js');
var JobConsoleAdapter = require('./_common/jobConsoleAdapter.js');
var exec = require('child_process').exec;
var workflowStrategies = {
  ci: require('./workflows/ci.js'),
  pipelines: require('./workflows/pipelines.js')
};

function microWorker(message) {
  var bag = {
    rawMessage: message
  };

  bag.who = util.format('runSh|%s', self.name);
  logger.info(bag.who, 'Inside');

  async.series([
      _checkInputParams.bind(null, bag),
      _applyWorkflowStrategy.bind(null, bag)
    ],
    function (err) {
      if (err)
        logger.error(bag.who, util.format('Failed to process message'));
      else
        logger.info(bag.who, util.format('Successfully processed message'));
      __restartExecContainer(bag);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  logger.verbose(who, 'Inside');

  if (!bag.rawMessage.builderApiToken) {
    logger.warn(util.inspect('%s, No builderApiToken present' +
      ' in incoming message', who));
    return next(true);
  }

  if (bag.rawMessage.jobId) {
    bag.workflow = 'ci';
    bag.consoleAdapter = new JobConsoleAdapter(bag.rawMessage.builderApiToken,
      bag.rawMessage.jobId);
  } else if (bag.rawMessage.payload && bag.rawMessage.payload.buildJobId) {
    bag.workflow = 'pipelines';
    bag.consoleAdapter = new BuildJobConsoleAdapter(
      bag.rawMessage.builderApiToken,
      bag.rawMessage.payload.buildJobId);
  } else {
    logger.warn(util.inspect('%s, No jobId/buildJobId present' +
      ' in incoming message', who));
    return next(true);
  }

  bag.builderApiAdapter = new Adapter(bag.rawMessage.builderApiToken);

  return next();
}

function _applyWorkflowStrategy(bag, next) {
  var who = bag.who + '|' + _applyWorkflowStrategy.name;
  logger.verbose(who, 'Inside');

  var workflowStrategy = workflowStrategies[bag.workflow];

  if (!workflowStrategy) {
    logger.warn(util.format('Strategy not found workflow: %s', bag.workflow));
    return next(true);
  }
  workflowStrategy(bag,
    function (err) {
      if (err) {
        logger.warn(who,
          util.format('Failed to apply strategy for workflow:%s',
           bag.workflow)
        );

        return next(err);
      }
      return next();
    }
  );
}

function __restartExecContainer(bag) {
  var who = bag.who + '|' + __restartExecContainer.name;
  logger.verbose(who, 'Inside');

  var retryOpts = {
    times: 5,
    interval: function(retryCount) {
      return 1000 * Math.pow(2, retryCount);
    }
  };

  async.retry(retryOpts,
    function (callback) {
      var callsPending = 0;

      if (bag.consoleAdapter)
        callsPending = bag.consoleAdapter.getPendingApiCallCount();

      if (callsPending < 1) {
        __restartContainer(bag);
        return callback();
      }
      return callback(true);
    },
    function(err) {
      if (err)
        logger.error('Still posting build consoles');
      // force restarting container
      __restartContainer(bag);
    }
  );
}

function __restartContainer(bag) {
  var who = bag.who + '|' + __restartContainer.name;
  logger.verbose(who, 'Inside');

  exec('docker restart -t=0 shippable-exec-$NODE_ID',
    function(err) {
      if (err)
        logger.error(util.format('Failed to stop container with ' +
          'err:%s', err));
    }
  );
}