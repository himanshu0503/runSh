'use strict';
var self = inStep;
module.exports = self;

var fs = require('fs-extra');
var path = require('path');
var executeDependencyScript =
  require('../../_common/executeDependencyScript.js');

function inStep(externalBag, dependency, buildInDir, callback) {
  var bag = {
    resBody: {},
    dependency: dependency,
    templatePath: path.resolve(__dirname, 'templates/inStep.sh'),
    buildInDir: buildInDir,
    buildJobId: externalBag.inPayload.buildJobId,
    scriptName: 'inStep.sh',
    builderApiAdapter: externalBag.builderApiAdapter,
    consoleAdapter: externalBag.consoleAdapter
  };

  bag.who = 'stepExec|_common|resources|params|' + self.name;
  logger.verbose(bag.who, 'Starting');

  bag.scriptPath =
   path.join(bag.buildInDir, bag.dependency.name, bag.scriptName);
  bag.paramsPath =
    path.join(bag.buildInDir, bag.dependency.name, 'params');

  async.series([
      _checkInputParams.bind(null, bag),
      _extractParams.bind(null, bag),
      _writeParams.bind(null, bag),
      _executeScript.bind(null, bag)
    ],
    function (err) {
      logger.verbose(bag.who, 'Completed');
      return callback(err, bag.resBody);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  logger.debug(who, 'Inside');

  bag.consoleAdapter.openCmd('Validating dependencies');
  var consoleErrors = [];

  if (!bag.dependency.version.propertyBag.params)
    consoleErrors.push(
      util.format('%s is missing: dependency.version.propertyBag.params', who)
    );

  if (consoleErrors.length > 0) {
    _.each(consoleErrors,
      function (e) {
        var msg = e;
        logger.error(bag.who, e);
        bag.consoleAdapter.publishMsg(msg);
      }
    );
    bag.consoleAdapter.closeCmd(false);
    return next(true);
  }

  bag.consoleAdapter.publishMsg('Successfully validated dependencies');
  bag.consoleAdapter.closeCmd(true);
  return next();
}

function _extractParams(bag, next) {
  var who = bag.who + '|' + _extractParams.name;
  logger.debug(who, 'Inside');

  bag.extractedParams = '';
  _.each(bag.dependency.version.propertyBag.params,
    function (paramValue, paramKey) {
      if (paramKey === 'secure')
        bag.extractedParams += paramValue + '\n';
      else
        bag.extractedParams += util.format('%s=%s\n', paramKey, paramValue);
    }
  );

  return next();
}

function _writeParams(bag, next) {
  var who = bag.who + '|' + _writeParams.name;
  logger.debug(who, 'Inside');

  fs.outputFile(bag.paramsPath, bag.extractedParams,
    function(err) {
      return next(err);
    }
  );
}

function _executeScript(bag, next) {
  var who = bag.who + '|' + _executeScript.name;
  logger.debug(who, 'Inside');

  var scriptBag = {
    dependency: bag.dependency,
    templatePath: bag.templatePath,
    scriptPath: bag.scriptPath,
    buildJobId: bag.buildJobId,
    parentGroupDescription: 'IN Params',
    builderApiAdapter: bag.builderApiAdapter,
    consoleAdapter: bag.consoleAdapter
  };

  executeDependencyScript(scriptBag,
    function (err) {
      if (err) {
        logger.error(who,
          util.format('Failed to execute script for dependency %s ' +
          'with error: %s', bag.dependency.name, err)
        );
        return next(true);
      }
      logger.debug(
        util.format('Successfully executed script for dependency %s',
          bag.dependency.name
        )
      );
      return next();
    }
  );
}
