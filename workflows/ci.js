'use strict';
var self = ci;
module.exports = self;

var fs = require('fs-extra');
var path = require('path');
var executeJobScript = require('../_common/executeJobScript.js');

function ci(externalBag, callback) {
  var bag = {
    pidFileLocation: config.pidFile,
    nodeId: config.nodeId,
    isSystemNode: false,
    jobId: externalBag.rawMessage.jobId,
    ciSteps: externalBag.rawMessage.steps,
    rawMessage: externalBag.rawMessage,
    consoleAdapter: externalBag.consoleAdapter,
    builderApiAdapter: externalBag.builderApiAdapter,
    isCIJobCancelled: false,
    mexecScriptDir: '/tmp/mexec',
    mexecScriptRunner: 'scriptRunner.sh',
    sshDir: '/tmp/ssh',
    cexecDir: '/tmp/cexec',
    cexecMessageName: 'message.json',
    artifactsDir: '/shippableci',
    onStartEnvDir: 'onstartjobenvs'
  };

  if (parseInt(global.config.nodeTypeCode) === global.nodeTypeCodes.system)
    bag.isSystemNode = true;

  bag.who = util.format('runSh|workflow|%s', self.name);
  logger.info(bag.who, 'Inside');

  async.series([
      _getSystemCodes.bind(null, bag),
      _getJobStatus.bind(null, bag),
      _getClusterNode.bind(null, bag),
      _getSystemNode.bind(null, bag),
      _validateCIJobMessage.bind(null, bag),
      _validateCIJobStepsOrder.bind(null, bag),
      _updateNodeIdInCIJob.bind(null, bag),
      _createMexecDir.bind(null, bag),
      _cleanOnStartEnvDir.bind(null, bag),
      _cleanSSHDir.bind(null, bag),
      _executeCIJob.bind(null, bag),
      _destroyPIDFile.bind(null, bag),
      _updateJobStatus.bind(null, bag)
    ],
    function (err) {
      return callback(err);
    }
  );
}

function _getSystemCodes(bag, next) {
  var who = bag.who + '|' + _getSystemCodes.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openGrp('Initializing Job');
  bag.consoleAdapter.openCmd('Getting system codes');

  var query = '';
  bag.builderApiAdapter.getSystemCodes(query,
    function (err, systemCodes) {
      if (err) {
        var msg =
          util.format('%s, Failed to :getSystemCodes, %s', who, err);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
        bag.ciJobStatusCode =
          __getStatusCodeByNameForCI(bag, 'FAILED');
      } else {
        bag.systemCodes = systemCodes;
        bag.consoleAdapter.publishMsg('Successfully fetched system codes');
        bag.consoleAdapter.closeCmd(true);
      }
      return next();
    }
  );
}

function _getJobStatus(bag, next) {
  var who = bag.who + '|' + _getJobStatus.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Getting job');

  bag.builderApiAdapter.getJobById(bag.jobId,
    function (err, job) {
      if (err) {
        bag.consoleAdapter.publishMsg(util.format('Failed to get ' +
          'job:%s with err:%s',bag.jobId, err));
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
        bag.ciJobStatusCode = __getStatusCodeByNameForCI(bag, 'FAILED');
      } else {
        bag.ciJob = job;

        if (job.statusCode === __getStatusCodeByNameForCI(bag, 'CANCELED') ||
          job.statusCode === __getStatusCodeByNameForCI(bag, 'TIMEOUT')) {
            bag.isCIJobCancelled = true;
            bag.consoleAdapter.publishMsg('Job:' + bag.jobId +
              ' is canceled/timedout, skipping');
            bag.consoleAdapter.closeCmd(true);
        } else {
          bag.consoleAdapter.publishMsg('Successfully fetched job');
          bag.consoleAdapter.closeCmd(true);
        }
      }
      return next();
    }
  );
}

function _getClusterNode(bag, next) {
  if (bag.ciJobStatusCode) return next();
  if (bag.isSystemNode) return next();
  if (bag.isCIJobCancelled) return next();

  var who = bag.who + '|' + _getClusterNode.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Getting node');

  bag.builderApiAdapter.getClusterNodeById(bag.nodeId,
    function (err) {
      if (err) {
        bag.consoleAdapter.publishMsg(util.inspect(err));
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
        bag.ciJobStatusCode =
          __getStatusCodeByNameForCI(bag, 'FAILED');
      } else {
        bag.consoleAdapter.publishMsg('Successfully fetched node');
        bag.consoleAdapter.closeCmd(true);
      }

      return next();
    }
  );
}

function _getSystemNode(bag, next) {
  if (bag.ciJobStatusCode) return next();
  if (!bag.isSystemNode) return next();
  if (bag.isCIJobCancelled) return next();

  var who = bag.who + '|' + _getSystemNode.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Getting node');

  bag.builderApiAdapter.getSystemNodeById(bag.nodeId,
    function (err) {
      if (err) {
        bag.consoleAdapter.publishMsg(util.inspect(err));
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
        bag.ciJobStatusCode =
          __getStatusCodeByNameForCI(bag, 'FAILED');
      } else {
        bag.consoleAdapter.publishMsg('Successfully fetched node');
        bag.consoleAdapter.closeCmd(true);
      }

      return next();
    }
  );
}

function _validateCIJobMessage(bag, next) {
  if (bag.ciJobStatusCode) return next();
  if (bag.isCIJobCancelled) return next();

  var who = bag.who + '|' + _validateCIJobMessage.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Validating incoming message');
  var consoleErrors = [];

  if (_.isEmpty(bag.ciSteps))
    consoleErrors.push('No steps found');
  else {
    _.each(bag.ciSteps,
      function(step) {
        if (!step.execOrder)
          consoleErrors.push(
            util.format('scriptType:%s is missing execOrder', step.scriptType));
      }
    );
  }

  if (consoleErrors.length > 0) {
    _.each(consoleErrors,
      function (e) {
        bag.consoleAdapter.publishMsg(e);
      }
    );
    bag.consoleAdapter.closeCmd(false);
    bag.consoleAdapter.closeGrp(false);

    bag.ciJobStatusCode =
      __getStatusCodeByNameForCI(bag, 'FAILED');
  } else {
    bag.consoleAdapter.publishMsg('Successfully validated incoming message');
    bag.consoleAdapter.closeCmd(true);
  }
  return next();
}

function _validateCIJobStepsOrder(bag, next) {
  if (bag.ciJobStatusCode) return next();
  if (bag.isCIJobCancelled) return next();

  var who = bag.who + '|' + _validateCIJobStepsOrder.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Validating steps order');

  bag.ciStepsInSortedOrder = _.sortBy(bag.ciSteps, 'execOrder');

  var bootIndex = _.findIndex(bag.ciStepsInSortedOrder,
    {who: 'mexec', scriptType: 'boot'});

  var errMsg;
  if (!bag.ciStepsInSortedOrder[bootIndex + 1])
    errMsg = 'Missing cexec step after boot step';
  else if (bag.ciStepsInSortedOrder[bootIndex + 1].who !== 'cexec')
    errMsg = 'Incorrect ordering of cexec step';

  if (errMsg) {
    bag.consoleAdapter.publishMsg(errMsg);
    bag.consoleAdapter.closeCmd(false);
    bag.consoleAdapter.closeGrp(false);
    bag.ciJobStatusCode =
      __getStatusCodeByNameForCI(bag, 'FAILED');
  } else {
    bag.consoleAdapter.publishMsg('Successfully validated steps order');
    bag.consoleAdapter.closeCmd(true);
  }
  return next();
}

function _updateNodeIdInCIJob(bag, next) {
  if (bag.ciJobStatusCode) return next();
  if (bag.isCIJobCancelled) return next();

  var who = bag.who + '|' + _updateNodeIdInCIJob.name;
  logger.verbose(who, 'Inside');
  bag.consoleAdapter.openCmd('Updating node');

  var update = {
    node: bag.nodeId,
    statusCode: __getStatusCodeByNameForCI(bag, 'PROCESSING')
  };

  bag.builderApiAdapter.putJobById(bag.jobId, update,
    function (err) {
      if (err) {
        var msg =
          util.format('%s, failed to :putJobById for jobId: %s, %s',
            who, bag.jobId, err);

        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);

        bag.ciJobStatusCode =
          __getStatusCodeByNameForCI(bag, 'FAILED');
      } else {
        bag.consoleAdapter.publishMsg('Successfully updated node in job');
        bag.consoleAdapter.closeCmd(true);
      }
      return next();
    }
  );
}

function _createMexecDir(bag, next) {
  if (bag.ciJobStatusCode) return next();
  if (bag.isCIJobCancelled) return next();

  var who = bag.who + '|' + _createMexecDir.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Creating mexec directory');

  fs.mkdirp(bag.mexecScriptDir,
    function (err) {
      if (err) {
        var msg =
          util.format('%s, failed to create dir:%s with err:%s',
            who, bag.mexecScriptDir, err);

        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);

        bag.ciJobStatusCode =
          __getStatusCodeByNameForCI(bag, 'FAILED');
      } else {
        bag.consoleAdapter.publishMsg('Successfully created mexec directory');
        bag.consoleAdapter.closeCmd(true);
      }
      return next();
    }
  );
}

function _cleanOnStartEnvDir(bag, next) {
  if (bag.ciJobStatusCode) return next();
  if (bag.isCIJobCancelled) return next();

  var jobEnvDir =  path.join(bag.artifactsDir, bag.onStartEnvDir);

  var who = bag.who + '|' + _cleanOnStartEnvDir.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Cleaning onStartEnvDir directory');

  fs.emptyDir(jobEnvDir,
    function (err) {
      if (err) {
        var msg =
          util.format('%s, failed to clean dir:%s with err:%s',
            who, jobEnvDir, err);

        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);

        bag.ciJobStatusCode =
          __getStatusCodeByNameForCI(bag, 'FAILED');
      } else {
        bag.consoleAdapter.publishMsg('Successfully cleaned ' +
          'onStartEnvDir directory');
        bag.consoleAdapter.closeCmd(true);
      }
      return next();
    }
  );
}

function _cleanSSHDir(bag, next) {
  if (bag.ciJobStatusCode) return next();
  if (bag.isCIJobCancelled) return next();

  var who = bag.who + '|' + _cleanSSHDir.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Cleaning ssh directory');

  fs.emptyDir(bag.sshDir,
    function (err) {
      if (err) {
        var msg =
          util.format('%s, failed to clean dir:%s with err:%s',
            who, bag.sshDir, err);

        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);

        bag.ciJobStatusCode =
          __getStatusCodeByNameForCI(bag, 'FAILED');
      } else {
        bag.consoleAdapter.publishMsg('Successfully cleaned ssh directory');
        bag.consoleAdapter.closeCmd(true);
        bag.consoleAdapter.closeGrp(true);
      }
      return next();
    }
  );
}

function _executeCIJob(bag, next) {
  if (bag.ciJobStatusCode) return next();
  if (bag.isCIJobCancelled) return next();

  var who = bag.who + '|' + _executeCIJob.name;
  logger.verbose(who, 'Inside');

  var scriptBag = {
    consoleAdapter: bag.consoleAdapter,
    steps: bag.ciStepsInSortedOrder,
    mexecFileNameWithPath: path.join(bag.mexecScriptDir,
      bag.mexecScriptRunner),
    ciJob: bag.ciJob,
    jobEnvDir: path.join(bag.artifactsDir, bag.onStartEnvDir),
    builderApiAdapter: bag.builderApiAdapter,
    rawMessage: bag.rawMessage,
    cexecMessageNameWithLocation: path.join(bag.cexecDir,
      bag.cexecMessageName),
    sshDir: bag.sshDir
  };

  executeJobScript(scriptBag,
    function (err) {
      if (err)
        bag.ciJobStatusCode = __getStatusCodeByNameForCI(bag, 'FAILED');

      return next();
    }
  );
}

function _destroyPIDFile(bag, next) {
  bag.consoleAdapter.openGrp('Updating Status');
  bag.consoleAdapter.openCmd('Removing PID File');

  var who = bag.who + '|' + _destroyPIDFile.name;
  logger.verbose(who, 'Inside');

  fs.remove(bag.pidFileLocation,
    function(err) {
      var msg;
      if (err) {
        msg = util.format('%s, Failed to delete job.pid ' +
          'file with err:%s', who, err);
      } else {
        msg = 'Successfully removed PID file';
      }

      bag.consoleAdapter.publishMsg(msg);
      bag.consoleAdapter.closeCmd(true);
      return next();
    }
  );
}

function _updateJobStatus(bag, next) {
  if (bag.isCIJobCancelled) return next();

  bag.consoleAdapter.openCmd('Updating job status');

  var who = bag.who + '|' + _updateJobStatus.name;
  logger.verbose(who, 'Inside');

  var update = {};

  //ciJobStatusCode is only set to failed, so if we reach this
  // function without any code we know job has succeeded
  if (!bag.ciJobStatusCode)
    bag.ciJobStatusCode =
      __getStatusCodeByNameForCI(bag, 'SUCCESS');

  update.statusCode = bag.ciJobStatusCode;

  bag.builderApiAdapter.putJobById(bag.jobId, update,
    function(err) {
      if (err) {
        var msg = util.format('%s, failed to :putJobById for ' +
          'jobId: %s with err: %s', who, bag.jobId, err);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
      } else {
        bag.consoleAdapter.publishMsg('Successfully updated job status');
        bag.consoleAdapter.closeCmd(true);
        bag.consoleAdapter.closeGrp(true);
      }
      return next();
    }
  );
}

function __getStatusCodeByNameForCI(bag, codeName) {
  return _.findWhere(bag.systemCodes,
    { group: 'statusCodes', name: codeName}).code;
}
