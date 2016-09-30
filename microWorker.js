'use strict';
var self = microWorker;
module.exports = self;

var fs = require('fs-extra');
var path = require('path');
var Adapter = require('./_common/shippable/Adapter.js');
var ConsoleAdapter = require('./_common/buildJobConsoleAdapter.js');
var saveState = require('./_common/saveState.js');
var executeScript = require('./_common/executeScript.js');
var getPreviousState = require('./_common/getPreviousState.js');
var exec = require('child_process').exec;

var inMap = {
  cluster: require('./resources/cluster/inStep.js'),
  deploy: require('./resources/deploy/inStep.js'),
  dockerOptions: require('./resources/dockerOptions/inStep.js'),
  file: require('./resources/file/inStep.js'),
  gitRepo: require('./resources/gitRepo/inStep.js'),
  image: require('./resources/image/inStep.js'),
  integration: require('./resources/integration/inStep.js'),
  kickStart: require('./resources/kickStart/inStep.js'),
  loadBalancer: require('./resources/loadBalancer/inStep.js'),
  manifest: require('./resources/manifest/inStep.js'),
  params: require('./resources/params/inStep.js'),
  release: require('./resources/release/inStep.js'),
  replicas: require('./resources/replicas/inStep.js'),
  rSync: require('./resources/rSync/inStep.js'),
  runSh: require('./resources/runSh/inStep.js'),
  syncRepo: require('./resources/syncRepo/inStep.js'),
  time: require('./resources/time/inStep.js'),
  trigger: require('./resources/trigger/inStep.js'),
  version: require('./resources/version/inStep.js')
};

var outMap = {
  image: require('./resources/image/outStep.js'),
  file: require('./resources/file/outStep.js')
};

function microWorker(message) {
  var bag = {
    builderApiToken: message.builderApiToken,
    inPayload: message.payload,
    buildId: null,
    buildRootDir: '/build',
    buildManagedDir: '/build/managed',
    pidFileLocation: config.pidFile,
    operation: {
      IN: 'IN',
      OUT: 'OUT',
      TASK: 'TASK',
      NOTIFY: 'NOTIFY'
    },
    outputVersion: {},
    nodeId: config.nodeId,
    builderApiAdapter: new Adapter(message.builderApiToken),
    containerAction: 'continue',
    isSystemNode: false,
    dirsToBeCreated: []
  };
  // Setting Paths for get/put root directories
  bag.stepExecScriptPath = bag.buildRootDir + '/stepExec.sh';
  bag.inRootDir = bag.buildRootDir + '/IN';
  bag.outRootDir = bag.buildRootDir + '/OUT';
  bag.stateDir = bag.buildRootDir + '/state';
  bag.previousStateDir = bag.buildRootDir + '/previousState';
  bag.messageFilePath = bag.buildRootDir + '/message.json';
  bag.outputVersionFilePath = bag.buildRootDir + '/state/outputVersion.json';
  bag.stepMessageFilename = 'version.json';
  bag.subPrivateKeyPath = '/tmp/00_sub';
  bag.runShName = 'runSh';

  if (global.config.nodeTypeCode === global.nodeTypeCodes['system'])
    bag.isSystemNode = true;

  // Push all the directories to be created in this array
  bag.dirsToBeCreated.push(bag.buildRootDir, bag.inRootDir,
    bag.outRootDir, bag.previousStateDir,
    bag.stateDir, bag.buildManagedDir);

  bag.buildJobId = bag.inPayload.buildJobId;

  bag.consoleAdapter =
    new ConsoleAdapter(bag.builderApiToken, bag.buildJobId);

  bag.who = util.format('runSh|%s', self.name);
  logger.info(bag.who, 'Inside');

  async.series([
      _getClusterNode.bind(null, bag),
      _getSystemNode.bind(null, bag),
      _publishJobNodeInfo.bind(null, bag),
      _getSystemCodes.bind(null, bag),
      _checkInputParams.bind(null, bag),
      _getBuildJobStatus.bind(null, bag),
      _validateDependencies.bind(null, bag),
      _updateNodeIdInBuildJob.bind(null, bag),
      _getBuildJobPropertyBag.bind(null, bag),
      _removeBuildDirectory.bind(null, bag),
      _createDirectories.bind(null, bag),
      _getPreviousState.bind(null, bag),
      _getSecrets.bind(null, bag),
      _extractSecrets.bind(null, bag),
      _saveSubPrivateKey.bind(null, bag),
      _saveMessage.bind(null, bag),
      _saveStepMessage.bind(null, bag),
      _sendStartMessage.bind(null, bag),
      _handleSteps.bind(null, bag),
      _persistPreviousStateOnFailure.bind(null, bag),
      _saveStepState.bind(null, bag),
      _getOutputVersion.bind(null, bag),
      _destroyPIDFile.bind(null, bag),
      _updateBuildJobStatus.bind(null, bag),
      _sendCompleteMessage.bind(null, bag),
      _updateResourceVersion.bind(null, bag),
      _updateBuildJobVersion.bind(null, bag),
      _updateBuildStatusAndVersion.bind(null, bag)
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

function _getClusterNode(bag, next) {
  if (bag.isSystemNode) return next();
  var who = bag.who + '|' + _getClusterNode.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openGrp('Job Node Info');
  bag.consoleAdapter.openCmd('Node provision time');

  bag.builderApiAdapter.getClusterNodeById(bag.nodeId,
    function (err, clusterNode) {
      if (err) {
        bag.consoleAdapter.publishMsg(util.inspect(err));
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
        return next(true);
      } else {
        var msg = util.format('Node %s provisioned at %s',
          bag.nodeId, new Date(clusterNode.provisionedAt));

        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(true);
        return next();
      }
    }
  );
}

function _getSystemNode(bag, next) {
  if (!bag.isSystemNode) return next();
  var who = bag.who + '|' + _getSystemNode.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openGrp('Job Node Info');
  bag.consoleAdapter.openCmd('Node provision time');

  bag.builderApiAdapter.getSystemNodeById(bag.nodeId,
    function (err, systemNode) {
      if (err) {
        bag.consoleAdapter.publishMsg(util.inspect(err));
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
        return next(true);
      } else {
        var msg = util.format('Node %s provisioned at %s',
          bag.nodeId, new Date(systemNode.provisionedAt));

        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(true);
        return next();
      }
    }
  );
}

function _publishJobNodeInfo(bag, next) {
  var who = bag.who + '|' + _publishJobNodeInfo.name;
  logger.verbose(who, 'Inside');

  var collectStatsTemplatePath =
    path.resolve(__dirname, './_common/templates/collect_stats.sh');

  var scriptBag = {
    scriptPath: collectStatsTemplatePath,
    args: [],
    options: {},
    consoleAdapter: bag.consoleAdapter
  };

  executeScript(scriptBag,
    function (err) {
      if (err)
        bag.consoleAdapter.closeGrp(false);
      else
        bag.consoleAdapter.closeGrp(true);
      return next();
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
        return next(true);
      }

      bag.systemCodes = systemCodes;
      bag.consoleAdapter.publishMsg('Successfully fetched system codes');
      bag.consoleAdapter.closeCmd(true);
      return next();
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Validating incoming message');

  var consoleErrors = [];

  if (!bag.inPayload)
    consoleErrors.push(util.format('%s is missing: inPayload', who));

  if (bag.inPayload) {
    if (!bag.inPayload.buildJobId)
      consoleErrors.push(
        util.format('%s is missing: inPayload.buildJobId', who)
      );

    bag.buildJobId = bag.inPayload.buildJobId;

    if (!bag.inPayload.resourceId)
      consoleErrors.push(
        util.format('%s is missing: inPayload.resourceId', who)
      );
    bag.resourceId = bag.inPayload.resourceId;

    if (!bag.inPayload.buildId)
      consoleErrors.push(util.format('%s is missing: inPayload.buildId', who));

    bag.buildId = bag.inPayload.buildId;

    if (!bag.inPayload.buildNumber)
      consoleErrors.push(
        util.format('%s is missing: inPayload.buildNumber', who));
    bag.buildNumber = bag.inPayload.buildNumber;

    if (!bag.inPayload.name)
      consoleErrors.push(util.format('%s is missing: inPayload.name', who));

    if (!bag.inPayload.type)
      consoleErrors.push(util.format('%s is missing: inPayload.type', who));

    if (!bag.inPayload.subscriptionId)
      consoleErrors.push(
        util.format('%s is missing: inPayload.subscriptionId', who)
      );

    if (!bag.inPayload.secretsToken)
      consoleErrors.push(
        util.format('%s is missing: inPayload.secretsToken', who)
      );

    if (!_.isObject(bag.inPayload.propertyBag))
      consoleErrors.push(
        util.format('%s is missing: inPayload.propertyBag', who)
      );

    if (!_.isArray(bag.inPayload.dependencies))
      consoleErrors.push(
        util.format('%s is missing: inPayload.dependencies', who)
      );

    bag.projectId = bag.inPayload.projectId;
  }

  if (consoleErrors.length > 0) {
    _.each(consoleErrors,
      function (e) {
        bag.consoleAdapter.publishMsg(e);
      }
    );
    bag.consoleAdapter.closeCmd(false);
    bag.consoleAdapter.closeGrp(false);

    bag.jobStatusCode = __getStatusCodeByName(bag, 'failure');
  } else {
    bag.consoleAdapter.publishMsg('Successfully validated incoming message');
    bag.consoleAdapter.closeCmd(true);
  }
  return next();
}


function _getBuildJobStatus(bag, next) {
  var who = bag.who + '|' + _getBuildJobStatus.name;
  logger.verbose(who, 'Inside');

  bag.builderApiAdapter.getBuildJobById(bag.buildJobId,
    function (err, buildJob) {
      if (err) {
        var msg = util.format('%s, Failed to get buildJob' +
          ' for buildJobId:%s, with err: %s', who, bag.buildJobId, err);
        logger.warn(msg);
        bag.jobStatusCode = __getStatusCodeByName(bag, 'error');
      }
      bag.isCancelled = false;
      if (buildJob.statusCode === __getStatusCodeByName(bag, 'cancelled')) {
        bag.isCancelled = true;
        var msg = util.format('%s, Job with buildJobId:%s' +
          ' is cancelled', who, bag.buildJobId);
        logger.warn(msg);
      }
      return next();
    }
  );
}

function _validateDependencies(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _validateDependencies.name;
  logger.verbose(who, 'Inside');
  bag.consoleAdapter.openCmd('Validating job dependencies');

  var dependencyErrors = [];

  _.each(bag.inPayload.dependencies,
    function (dependency) {
      if (dependency.nonexistent)
        return dependencyErrors.push(
          util.format('%s, %s dependency has been deleted from the yml ' +
            'or has no versions', who, dependency.name)
        );

      if (!dependency.name)
        dependencyErrors.push(
          util.format('%s, %s dependency is missing :name', who, dependency)
        );

      if (!dependency.operation)
        dependencyErrors.push(
          util.format('%s, %s dependency is missing :operation',
            who, dependency.name)
        );

      if (!dependency.resourceId)
        dependencyErrors.push(
          util.format('%s, %s dependency is missing :resourceId',
            who, dependency.name)
        );

      if (!dependency.type)
        dependencyErrors.push(
          util.format('%s, %s dependency is missing :type',
            who, dependency.name)
        );

      if (!_.isObject(dependency.propertyBag))
        dependencyErrors.push(
          util.format('%s, %s dependency is missing :propertyBag',
            who, dependency.name)
        );

      if (!_.isObject(dependency.version))
        dependencyErrors.push(
          util.format('%s, %s dependency is missing :version',
            who, dependency.name)
        );

      if (_.isObject(dependency.version)) {
        if (!dependency.version.versionId)
          dependencyErrors.push(
            util.format('%s, %s dependency is missing :type', who,
              dependency.name)
          );

        if (!_.isObject(dependency.version.propertyBag))
          dependencyErrors.push(
            util.format('%s, %s dependency is missing :version.propertyBag',
              who, dependency.name)
          );
      }

      if (!dependency.isConsistent)
        dependencyErrors.push(
          util.format('%s, %s dependency is inconsistent', who, dependency.name)
        );
    }
  );

  if (dependencyErrors.length > 0) {
    _.each(dependencyErrors,
      function (e) {
        bag.consoleAdapter.publishMsg(e);
      }
    );
    bag.consoleAdapter.closeCmd(false);

    bag.jobStatusCode = __getStatusCodeByName(bag, 'failure');
  } else {
    bag.consoleAdapter.publishMsg('Successfully validated ' +
      bag.inPayload.dependencies.length + ' dependencies');
    bag.consoleAdapter.closeCmd(true);
  }

  return next();
}

function _updateNodeIdInBuildJob(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _updateNodeIdInBuildJob.name;
  logger.verbose(who, 'Inside');
  bag.consoleAdapter.openCmd('Updating node');

  var update = {
    nodeId: bag.nodeId
  };

  bag.builderApiAdapter.putBuildJobById(bag.buildJobId, update,
    function (err) {
      if (err) {
        var msg =
          util.format('%s, failed to :putBuildJobById for buildJobId: %s, %s',
            who, bag.buildJobId, err);

        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);

        bag.jobStatusCode = __getStatusCodeByName(bag, 'error');
      } else {
        bag.consoleAdapter.closeCmd(true);
      }
      return next();
    }
  );
}

function _getBuildJobPropertyBag(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _getBuildJobPropertyBag.name;
  logger.verbose(who, 'Inside');
  bag.consoleAdapter.openCmd('Parsing job properties');

  bag.buildJobPropertyBag = bag.inPayload.propertyBag;
  if (_.isEmpty(bag.buildJobPropertyBag.yml))
    bag.buildJobPropertyBag.yml = {};

  if (_.isEmpty(bag.buildJobPropertyBag.yml.on_success))
    bag.buildJobPropertyBag.yml.on_success = [];
  if (_.isEmpty(bag.buildJobPropertyBag.yml.on_failure))
    bag.buildJobPropertyBag.yml.on_failure = [];

  bag.consoleAdapter.publishMsg('Successfully parsed job properties');
  bag.consoleAdapter.closeCmd(true);
  return next();
}

function _removeBuildDirectory(bag, next) {
  if (bag.isCancelled) return next();

  var who = bag.who + '|' + _removeBuildDirectory.name;
  logger.verbose(who, 'Inside');
  bag.consoleAdapter.openCmd('Cleaning up build directory');

  var path = bag.buildRootDir;

  fs.remove(path,
    function (err) {
      if (err) {
        var msg =
          util.format('%s, Failed to remove %s folder, %s', who, path, err);

        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);

        bag.jobStatusCode = __getStatusCodeByName(bag, 'error');
      } else {
        bag.consoleAdapter.publishMsg('Successfully cleaned: ' + path);
        bag.consoleAdapter.closeCmd(true);
      }
      return next();
    }
  );
}

function _createDirectories(bag, next) {
  if (bag.isCancelled) return next();

  var who = bag.who + '|' + _createDirectories.name;
  logger.verbose(who, 'Inside');
  bag.consoleAdapter.openCmd('Creating build directories for job: ' +
    bag.buildJobId);

  async.eachLimit(bag.dirsToBeCreated, 10,
    function(path, nextPath) {
      fs.mkdirp(path,
        function (err) {
          if (err) {
            var msg = util.format('%s, Failed to dir at path:%s with err: %s',
                who, path, err);

            bag.consoleAdapter.publishMsg(msg);
            return nextPath(true);
          }
          bag.consoleAdapter.publishMsg(
            'Successfully created directory at path: ' + path);
          return nextPath();
        }
      );
    },
    function(err) {
      if (err) {
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);

        bag.jobStatusCode = __getStatusCodeByName(bag, 'error');
      }
      else
        bag.consoleAdapter.closeCmd(true);

      return next();
    }
  );
}

function _getPreviousState(bag, next) {
  if (bag.isCancelled) return next();

  var who = bag.who + '|' + _getPreviousState.name;
  logger.verbose(who, 'Inside');

  // All the commands are opened in the file
  getPreviousState(bag,
    function (err) {
      if (err) {
        var msg = util.format('%s, Did not find previous state for ' +
          'resource: %s', who, bag.inPayload.name);
        logger.verbose(msg);
      }

      if (bag.jobStatusCode)
        bag.consoleAdapter.closeGrp(false);

      return next();
    }
  );
}

function _getSecrets(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _getSecrets.name;
  logger.verbose(who, 'Inside');

  bag.builderApiAdapter.headers['X-SECRETS-TOKEN'] =
    bag.inPayload.secretsToken;
  bag.builderApiAdapter.getBuildJobById(bag.buildJobId,
    function (err, buildJob) {
      if (err) {
        var msg = util.format('%s, Failed to get accountIntegrations' +
          ' for buildJobId:%s, with err: %s', who, bag.buildJobId, err);
        logger.warn(msg);
        bag.jobStatusCode = __getStatusCodeByName(bag, 'failure');
      }
      bag.secrets = buildJob.secrets;

      delete bag.builderApiAdapter.headers['X-SECRETS-TOKEN'];
      return next();
    }
  );
}

function _saveSubPrivateKey(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();
  if (bag.inPayload.type !== bag.runShName) return next();

  var who = bag.who + '|' + _saveSubPrivateKey.name;
  logger.verbose(who, 'Inside');

  fs.outputFile(bag.subPrivateKeyPath,
    bag.secrets.data.subscription.sshPrivateKey,
    function (err) {
      if (err) {
        var msg = util.format('%s, Failed to save subscription private key, %s',
          who, err);
        logger.warn(msg);
        bag.jobStatusCode = __getStatusCodeByName(bag, 'error');
      } else {
        fs.chmodSync(bag.subPrivateKeyPath, '600');
      }
      return next();
    }
  );
}

function _extractSecrets(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _extractSecrets.name;
  logger.verbose(who, 'Inside');

  _.each(bag.inPayload.dependencies,
    function (dependency) {
      if (dependency.type === 'params') {
        var decryptedParams =
          _.findWhere(bag.secrets.data.steps, { name: dependency.name });
        if (decryptedParams) {
          dependency.version.propertyBag.params = decryptedParams.params;
        }
      }
    }
  );

  return next();
}

function _saveMessage(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _saveMessage.name;
  logger.verbose(who, 'Inside');
  bag.consoleAdapter.openCmd('Saving incoming job message');

  // If TASK step is not present, a managed TASK step is
  // automatically injected as last step by Shippable
  // This has to be done before saving the message,
  // as message.json is used by all the managed tasks.

  var isTaskStepPresent = _.some(bag.inPayload.propertyBag.yml.steps,
    function (step) {
      return _.has(step, bag.operation.TASK);
    }
  );
  if (!isTaskStepPresent)
    bag.inPayload.propertyBag.yml.steps.push({TASK : 'managed'});


  fs.writeFile(bag.messageFilePath, JSON.stringify(bag.inPayload),
    function (err) {
      if (err) {
        var msg = util.format('%s, Failed to save payload message, %s',
          who, err);

        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);

        bag.jobStatusCode = __getStatusCodeByName(bag, 'error');
      } else {
        bag.consoleAdapter.publishMsg(
          'Successfully saved incoming job message at: ' + bag.messageFilePath);
        bag.consoleAdapter.closeCmd(true);
      }

      return next();
    }
  );
}

function _saveStepMessage(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _saveStepMessage.name;
  logger.verbose(who, 'Inside');
  bag.consoleAdapter.openCmd('Saving dependency step messages');

  async.eachLimit(bag.inPayload.dependencies, 10,
    function (dependency, nextDependency) {
      if (dependency.operation === bag.operation.NOTIFY)
        return nextDependency();

      var path;
      if (dependency.operation === bag.operation.IN)
        path = bag.inRootDir + '/' + dependency.name;
      else if (dependency.operation === bag.operation.OUT)
        path = bag.outRootDir + '/' + dependency.name;
      else {
        logger.error(who,
          util.format('No valid operation found for dependency %s',
            util.inspect(dependency))
        );
        bag.consoleAdapter.publishMsg(
          'No valid operation found for dependency: ' +
            util.inspect(dependency));
        return nextDependency(true);
      }

      var innerBag = {
        who: who,
        path: path,
        fileName: bag.stepMessageFilename,
        object: dependency,
        consoleAdapter: bag.consoleAdapter
      };

      async.series([
          __createDir.bind(null, innerBag),
          __saveFile.bind(null, innerBag)
        ],
        function (err) {
          if (err)
            return nextDependency(true);
          return nextDependency();
        }
      );
    },
    function (err) {
      if (err) {
        bag.consoleAdapter.publishMsg(JSON.stringify(err));
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);

        bag.jobStatusCode = __getStatusCodeByName(bag, 'error');
      } else {
        bag.consoleAdapter.closeCmd(true);
      }

      return next();
    }
  );
}

function _sendStartMessage(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _sendStartMessage.name;
  logger.verbose(who, 'Inside');
  bag.consoleAdapter.openCmd('Job initialization complete');

  var message = {
    where: 'core.nf',
    payload: {
      objectType: 'buildJob',
      objectId: bag.buildJobId,
      event: 'on_start'
    }
  };

  bag.builderApiAdapter.postToVortex(message,
    function (err) {
      if (err) {
        var msg = 'Failed to send on_start message' + err;
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
        return next();
      }

      logger.debug('Sent on_start message');
      bag.consoleAdapter.closeCmd(true);
      bag.consoleAdapter.closeGrp(true);
      return next();
    }
  );
}

function _handleSteps(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _handleSteps.name;
  logger.verbose(who, 'Inside');

  if (!bag.inPayload.propertyBag.yml) {
    bag.consoleAdapter.openGrp('Step Error');
    bag.consoleAdapter.openCmd('Errors');
    bag.consoleAdapter.publishMsg('No YML found for job steps');
    bag.consoleAdapter.closeCmd(false);
    bag.consoleAdapter.closeGrp(false);

    bag.jobStatusCode = __getStatusCodeByName(bag, 'failure');
  }

  async.eachSeries(bag.inPayload.propertyBag.yml.steps,
    function (step, nextStep) {
      logger.verbose('Executing step:', step);

      var operation = _.find(_.keys(step),
        function (key) {
          return _.contains(
            [bag.operation.IN, bag.operation.OUT, bag.operation.TASK], key);
        }
      );
      var name = step[operation];

      var dependency = _.find(bag.inPayload.dependencies,
        function (dependency) {
          return dependency.name === name && dependency.operation === operation;
        }
      );

      if (!dependency && operation === bag.operation.TASK)
        dependency = {
          name: name,
          operation: operation
        };

      if (!dependency) {
        bag.consoleAdapter.openGrp('Step Error');
        bag.consoleAdapter.openCmd('Errors');

        var msg = util.format('%s, Missing dependency for: %s %s',
          who, operation, name);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);

        return nextStep(true);
      }

      async.series([
          __handleDependency.bind(null, bag, dependency),
          __getDependencyIntegrations.bind(null, bag, dependency),
          __generateStepExecScript.bind(null, bag, dependency),
          __writeStepExecScript.bind(null, bag, dependency),
          __executeManagedTask.bind(null, bag, dependency)
        ],
        function (err) {
          if (bag.isGrpSuccess)
            bag.consoleAdapter.closeGrp(true);
          else {
            bag.consoleAdapter.closeCmd(false);
            bag.consoleAdapter.closeGrp(false);
          }
          return nextStep(err);
        }
      );
    },
    function (err) {
      if (err || bag.managedTaskFailed)
        bag.jobStatusCode = __getStatusCodeByName(bag, 'failure');
      return next();
    }
  );
}

function __handleDependency(bag, dependency, next) {
  // We don't know where the group will end so need a flag
  bag.isGrpSuccess = true;

  if (dependency.operation === bag.operation.TASK) return next();
  if (dependency.operation === bag.operation.NOTIFY) return next();

  var msg = util.format('Processing %s Dependency: %s', dependency.operation,
    dependency.name);
  bag.consoleAdapter.openGrp(msg);

  var who = bag.who + '|' + __handleDependency.name;
  logger.verbose(who, 'Inside');
  bag.consoleAdapter.openCmd('Dependency Info');
  bag.consoleAdapter.publishMsg('Version Number: ' +
    dependency.version.versionNumber);

  if (dependency.version.versionName !== null)
    bag.consoleAdapter.publishMsg('Version Name: ' +
      dependency.version.versionName);
  bag.consoleAdapter.closeCmd(true);

  bag.consoleAdapter.openCmd('Validating ' + dependency.name + ' handler');

  var dependencyHandler;
  var rootDir;
  if (dependency.operation === bag.operation.IN) {
    dependencyHandler = inMap[dependency.type];
    rootDir = bag.inRootDir;
  } else if (dependency.operation === bag.operation.OUT) {
    dependencyHandler = outMap[dependency.type];
    rootDir = bag.outRootDir;
  }

  if (!dependencyHandler) {
    msg = util.format('No dependencyHandler for dependency type: %s %s',
      dependency.operation, dependency.type);

    bag.consoleAdapter.publishMsg(msg);
    bag.isGrpSuccess = false;

    return next(true);
  }

  if (!rootDir) {
    msg = util.format('No root directory for dependency type: %s %s',
      dependency.operation, dependency.type);
    bag.consoleAdapter.publishMsg(msg);
    bag.isGrpSuccess = false;
    return next(true);
  }

  // Closing the command as dependencyHandler will call it's own cmd
  bag.consoleAdapter.publishMsg('Successfully validated handler');
  bag.consoleAdapter.closeCmd(true);

  dependencyHandler(bag, dependency, rootDir,
    function (err) {
      if (err)
        bag.isGrpSuccess = false;
      return next(err);
    }
  );
}

function __getDependencyIntegrations(bag, dependency, next) {
  if (dependency.operation !== bag.operation.IN) return next();
  if (!dependency.subscriptionIntegrationId) return next();

  var who = bag.who + '|' + __getDependencyIntegrations.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Getting dependency integrations');

  bag.builderApiAdapter.getSubscriptionIntegrationById(
    dependency.subscriptionIntegrationId,
    function (err, subInt) {
      if (err) {
        var msg = util.format('%s, Failed getSubscriptionIntegrationById for' +
          'id: %s, with err: %s', who,
          dependency.subscriptionIntegrationId, err);

        bag.isGrpSuccess = false;
        bag.consoleAdapter.publishMsg(msg);

        return next(err);
      }
      var accountIntegration = _.findWhere(bag.secrets.data.accountIntegrations,
       { id: subInt.accountIntegrationId });

      var innerBag = {
        who: who,
        path: bag.inRootDir + '/' + dependency.name + '/',
        fileName: 'integration.json',
        object: accountIntegration,
        consoleAdapter: bag.consoleAdapter
      };

      var integrationValues = _.omit(accountIntegration, ['id', 'masterName']);
      var envString = '';
      _.each(_.keys(integrationValues), function (key) {
        if (_.isEmpty(envString))
          envString = key + '="' + integrationValues[key] + '"';
        else
          envString = envString + '\n' + key + '="' +
            integrationValues[key] + '"';
      });

      var innerBagEnv = {
        who: who,
        path: bag.inRootDir + '/' + dependency.name + '/',
        fileName: 'integration.env',
        object: envString,
        consoleAdapter: bag.consoleAdapter
      };

      async.series([
          __createDir.bind(null, innerBag),
          __saveFile.bind(null, innerBag),
          __saveFile.bind(null, innerBagEnv),
        ],
        function (err) {
          if (err) {
            bag.isGrpSuccess = false;

            return next(true);
          }

          bag.consoleAdapter.closeCmd(true);

          return next();
        }
      );
    }
  );
}

function __generateStepExecScript(bag, dependency, next) {
  if (dependency.operation !== bag.operation.TASK) return next();

  var message = util.format('Executing Managed Task: %s', bag.inPayload.type);

  bag.consoleAdapter.openGrp(message);
  bag.consoleAdapter.openCmd('Generating task script');

  var who = bag.who + '|' + __generateStepExecScript.name;
  logger.verbose(who, 'Inside');

  var strategyDir =
    path.join(__dirname, 'managed', bag.inPayload.type);
  var strategyPath =
    path.join(strategyDir, 'run.sh');
  fs.chmodSync(strategyPath, '755');

  var stepExecTemplatePath =
    path.resolve(__dirname, './_common/templates/stepExec.sh');
  var scriptContent =
    fs.readFileSync(stepExecTemplatePath).toString();
  var template = _.template(scriptContent);

  var on_success = [];
  if (bag.inPayload.type === 'runSh')
    _.each(bag.buildJobPropertyBag.yml.on_success,
      function (step) {
        if (_.has(step, 'script'))
          on_success.push(step.script);
      }
    );

  var on_failure = [];
  if (bag.inPayload.type === 'runSh')
    _.each(bag.buildJobPropertyBag.yml.on_failure,
      function (step) {
        if (_.has(step, 'script'))
          on_failure.push(step.script);
      }
    );

  var env = [
    util.format('RESOURCE_ID=%s', bag.resourceId),
    util.format('BUILD_ID=%s', bag.buildId),
    util.format('BUILD_NUMBER=%s', bag.buildNumber),
    util.format('BUILD_JOB_ID=%s', bag.buildJobId),
    util.format('BUILD_JOB_NUMBER=%s', 1),
    util.format('JOB_NAME=%s', bag.inPayload.name),
    util.format('JOB_TYPE=%s', bag.inPayload.type),
    util.format('SUBSCRIPTION_ID=%s', bag.inPayload.subscriptionId)
  ];

  var templateData = {
    scriptPath: strategyPath,
    on_success: on_success,
    on_failure: on_failure,
    env: env
  };

  bag.consoleAdapter.publishMsg('Successfully generated managed task script');
  bag.stepExecScript = template(templateData);
  bag.consoleAdapter.closeCmd(true);

  return next();
}

function __writeStepExecScript(bag, dependency, next) {
  if (dependency.operation !== bag.operation.TASK) return next();

  var who = bag.who + '|' + __writeStepExecScript.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Writing managed task script');

  fs.writeFile(bag.stepExecScriptPath, bag.stepExecScript,
    function (err) {
      if (err) {
        var msg = util.format('%s, Failed to save stepExec ' +
          'script with err:%s', who, err);

        bag.consoleAdapter.publishMsg(msg);
        bag.isGrpSuccess = false;

        return next(err);
      }

      fs.chmodSync(bag.stepExecScriptPath, '755');
      bag.consoleAdapter.publishMsg(
        'Successfully saved managed task script: ' + bag.stepExecScriptPath);
      bag.consoleAdapter.closeCmd(true);
      return next();
    }
  );
}

function __executeManagedTask(bag, dependency, next) {
  if (dependency.operation !== bag.operation.TASK) return next();

  var who = bag.who + '|' + __executeManagedTask.name;
  logger.verbose(who, 'Inside');

  var strategyDir =
    path.join(__dirname, 'managed', bag.inPayload.type);

  var scriptBag = {
    scriptPath: bag.stepExecScriptPath,
    args: [],
    options: { cwd: strategyDir },
    buildJobId: bag.inPayload.buildJobId,
    parentGroupDescription: 'managed task',
    builderApiAdapter: bag.builderApiAdapter,
    consoleAdapter: bag.consoleAdapter
  };

  executeScript(scriptBag,
    function (err) {
      if (err) {
        logger.error(who,
          util.format('managed script failed with err:%s', err)
        );
        // We're not returning error when managed task fails
        //so we need to explicitly tell that it failed
        bag.managedTaskFailed = true;
        bag.isGrpSuccess = false;
      }
      return next();
    }
  );
}

function _persistPreviousStateOnFailure(bag, next) {
  if (!bag.jobStatusCode) return next();

  var who = bag.who + '|' + _persistPreviousStateOnFailure.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openGrp('Persisting Previous State');
  bag.consoleAdapter.openCmd('Copy previous state to current state');

  var srcDir = bag.previousStateDir ;
  var destDir = bag.stateDir;
  fs.copy(srcDir, destDir,
    function (err) {
      if(err) {
        bag.consoleAdapter.publishMsg(
          'Failed to persist previous state of job');
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
      }
      bag.consoleAdapter.publishMsg(
        'Successfully persisted previous state of job');
      bag.consoleAdapter.closeCmd(true);
      bag.consoleAdapter.closeGrp(true);

      return next();
    }
  );
}

function _saveStepState(bag, next) {
  if (bag.isCancelled) return next();
  var who = bag.who + '|' + _saveStepState.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openGrp('Saving Job Files');

  saveState(bag,
    function (err, sha) {
      if (err) {
        logger.error(who,
          util.format('Failed to save state for resource: %s',
            bag.inPayload.name), err
        );

        bag.consoleAdapter.closeGrp(false);

        bag.jobStatusCode = __getStatusCodeByName(bag, 'error');
      } else {
        bag.versionSha = sha;
        if (bag.jobStatusCode)
          bag.consoleAdapter.closeGrp(true);
      }
      return next();
    }
  );
}

function _getOutputVersion(bag, next) {
  if (bag.isCancelled) return next();
  if (bag.jobStatusCode) return next();

  var who = bag.who + '|' + _getOutputVersion.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Reading output version');

  fs.readJson(bag.outputVersionFilePath,
    function (err, outputVersion) {
      // don't throw an error if this file doesn't exist
      var msg;
      if (err) {
        msg = util.format('%s, Failed to read %s', who,
          bag.outputVersionFilePath);
      } else {
        msg = 'Successfully read output version';
      }
      bag.outputVersion = outputVersion || {};

      bag.consoleAdapter.publishMsg(msg);
      bag.consoleAdapter.closeCmd(true);
      bag.consoleAdapter.closeGrp(true);
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

function _updateBuildJobStatus(bag, next) {
  if (bag.isCancelled) return next();
  if (!bag.buildJobId) return next();

  bag.consoleAdapter.openCmd('Updating build job status');

  var who = bag.who + '|' + _updateBuildJobStatus.name;
  logger.verbose(who, 'Inside');

  var update = {};

  //jobStatusCode is only set to failure/error, so if we reach this function
  // without any code we know job has succeeded
  if (!bag.jobStatusCode)
    bag.jobStatusCode = __getStatusCodeByName(bag, 'success');

  update.statusCode = bag.jobStatusCode;

  bag.builderApiAdapter.putBuildJobById(bag.buildJobId, update,
    function(err) {
      if (err) {
        var msg = util.format('%s, failed to :putBuildJobById for ' +
          'buildJobId: %s with err: %s', who, bag.buildJobId, err);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
      } else {
        bag.consoleAdapter.publishMsg('Successfully updated build ' +
          'job status');
        bag.consoleAdapter.closeCmd(true);
      }
      return next();
    }
  );
}

function _sendCompleteMessage(bag, next) {
  if (bag.isCancelled) return next();
  if (!bag.buildJobId) return next();

  var who = bag.who + '|' + _sendCompleteMessage.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Sending build job notification');

  var event;

  if (bag.jobStatusCode === __getStatusCodeByName(bag, 'success'))
    event = 'on_success';
  else
    event = 'on_failure';

  var message = {
    where: 'core.nf',
    payload: {
      objectType: 'buildJob',
      objectId: bag.buildJobId,
      event: event
    }
  };

  var msg;
  bag.builderApiAdapter.postToVortex(message,
    function (err) {
      if (err) {
        msg = util.format('%s, Failed to send %s message with ' +
          'error %s',who, event, err);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
      } else {
        msg = util.format('Successfully sent %s message', event);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(true);
      }
      return next();
    }
  );
}

function _updateResourceVersion(bag, next) {
  if (bag.isCancelled) return next();
  if (!bag.resourceId) return next();

  var who = bag.who + '|' + _updateResourceVersion.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Updating resource version');

  var resource = {
    resourceId: bag.resourceId,
    projectId: bag.projectId,
    propertyBag: {}
  };

  if (bag.jobStatusCode === __getStatusCodeByName(bag, 'success') &&
    bag.isGrpSuccess)
    resource.versionTrigger = true;
  else
    resource.versionTrigger = false;

  if (bag.outputVersion)
    _.extend(resource,  bag.outputVersion);

  resource.propertyBag.sha = bag.versionSha;

  var msg;
  bag.builderApiAdapter.postVersion(resource,
    function (err, version) {
      if (err) {
        msg = util.format('%s, Failed to post version for ' +
          'resourceId: %s with err: %s', who, bag.resourceId, err);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
      } else {
        bag.version = version;
        msg = util.format('Successfully posted version:%s for ' +
          'resourceId: %s', version.id, bag.resourceId);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(true);
      }
      return next();
    }
  );
}

function _updateBuildJobVersion(bag, next) {
  if (bag.isCancelled) return next();
  if (!bag.buildJobId) return next();
  if (!bag.version || !bag.version.id) return next();

  bag.consoleAdapter.openCmd('Updating version in build job');

  var who = bag.who + '|' + _updateBuildJobVersion.name;
  logger.verbose(who, 'Inside');

  var update = {
    versionId: bag.version.id
  };

  var msg;
  bag.builderApiAdapter.putBuildJobById(bag.buildJobId, update,
    function(err) {
      if (err) {
        msg = util.format('%s, Failed to updated version for ' +
          'buildJobId: %s with err: %s', who, bag.buildJobId, err);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
      } else  {
        msg = util.format('Successfully updated version in ' +
          'build job to %s', update.versionId);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(true);
      }
      return next();
    }
  );
}

function _updateBuildStatusAndVersion(bag, next) {
  if (bag.isCancelled) return next();
  if (!bag.buildId || !bag.buildJobId) return next();

  var who = bag.who + '|' + _updateBuildStatusAndVersion.name;
  logger.verbose(who, 'Inside');

  bag.consoleAdapter.openCmd('Updating build status');

  var versionId;

  if (bag.version)
    versionId = bag.version.id;

  var update = {
    versionId: versionId
  };

  update.statusCode = bag.jobStatusCode;

  var msg;
  bag.builderApiAdapter.putBuildById(bag.buildId, update,
    function(err) {
      if (err) {
        msg = util.format('%s, Failed to :putBuildById for ' +
          'buildId: %s with err: %s', who, bag.buildId, err);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        bag.consoleAdapter.closeGrp(false);
      } else {
        msg = util.format('Successfully updated build status');
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(true);
        bag.consoleAdapter.closeGrp(true);
      }
      return next();
    }
  );
}

function __createDir(bag, next) {
  var who = bag.who + '|' + __createDir.name;
  logger.debug(who, 'Inside');

  fs.mkdirs(bag.path,
    function(err) {
      var msg = util.format('%s, Failed to create %s folder with' +
        'err: %s', who, bag.path, err);
      if (err) {
        bag.consoleAdapter.publishMsg(msg);
        return next(true);
      }

      bag.consoleAdapter.publishMsg('Successfully created folder: ' + bag.path);
      return next();
    }
  );
}

function __saveFile(bag, next) {
  var who = bag.who + '|' + __saveFile.name;
  logger.debug(who, 'Inside');

  var path = bag.path + '/' + bag.fileName;
  var data = bag.object;
  if (_.isObject(bag.object))
    data = JSON.stringify(bag.object);

  fs.writeFile(path, data, [],
    function(err) {
      if (err) {
        var msg = util.format('%s, Failed to save object:%s at %s with' +
          'err: %s', who, bag.object, path, err);
        bag.consoleAdapter.publishMsg(msg);
        return next(true);
      }
      bag.consoleAdapter.publishMsg(
        'Successfully saved object: ' + bag.fileName);
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
    function(callback) {
      var callsPending = bag.consoleAdapter.getPendingApiCallCount();
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

  exec('sudo docker restart -t=0 shippable-exec-$CLUSTER_NODE_ID',
    function(err) {
      if (err)
        logger.error(util.format('Failed to stop container with ' +
          'err:%s', err));
    }
  );
}

function __getStatusCodeByName(bag, codeName) {
  return _.findWhere(bag.systemCodes, { group: 'status', name: codeName}).code;
}
