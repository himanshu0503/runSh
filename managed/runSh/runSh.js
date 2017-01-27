'use strict';
var self = runSh;

module.exports = self;

var async = require('async');
var fs = require('fs-extra');
var _ = require('underscore');
var spawn = require('child_process').spawn;
var util = require('util');
var path = require('path');

function runSh(callback) {
  var bag = {
    buildRootDir: '/build',
    subscriptionKeyPath: '/tmp/00_sub',
    scriptsTemplatePath: path.join(__dirname, '_templates', 'scripts.sh'),
    scriptsPath: '/build/managed/scripts.sh',
    executeScriptPath: '/build/managed/exec.sh'
  };
  bag.messageFilePath = bag.buildRootDir + '/message.json';

  async.series([
      _readMessage.bind(null, bag),
      _getTask.bind(null, bag),
      _getScripts.bind(null, bag),
      _readScriptsTemplate.bind(null, bag),
      _writeScripts.bind(null, bag),
      _generateExecScript.bind(null, bag),
      _executeScripts.bind(null, bag)
    ],
    function (err) {
      if (err)
        console.log('runSh failed with error: ', err);
      callback(err);
    }
  );
}

function _readMessage(bag, next) {
  fs.readJson(bag.messageFilePath,
    function (err, message) {
      bag.message = message;
      return next(err);
    }
  );
}

function _getTask(bag, next) {
  if (bag.message.propertyBag.yml)
    bag.task = _.find(bag.message.propertyBag.yml.steps,
      function (step) {
        return !_.isUndefined(step.TASK);
      }
    );

  return next();
}

function _getScripts(bag, next) {
  if (!bag.task) return next();

  bag.scriptTaskSteps = _.filter(bag.task.TASK,
    function(taskStep) {
      return !_.isUndefined(taskStep.script);
    }
  );

  return next();
}

function _readScriptsTemplate(bag, next) {
  if (!bag.scriptTaskSteps) return next();

  var templateString = fs.readFileSync(bag.scriptsTemplatePath).toString();
  var template = _.template(templateString);
  var templateData = {
    scripts: _.pluck(bag.scriptTaskSteps, 'script')
  };
  bag.scriptsScript = template(templateData);

  return next();
}

function _writeScripts(bag, next) {
  if (!bag.scriptTaskSteps) return next();

  fs.outputFile(bag.scriptsPath, bag.scriptsScript,
    function (err) {
      if (err)
        console.log(err);
      else
        fs.chmodSync(bag.scriptsPath, '755');
      return next(err);
    }
  );
}

function _generateExecScript(bag, next) {
  if (!bag.scriptTaskSteps) return next();

  var scriptContent =
    util.format('ssh-agent /bin/bash -c \'ssh-add %s; %s \'',
      bag.subscriptionKeyPath, bag.scriptsPath);

  fs.outputFile(bag.executeScriptPath, scriptContent,
    function (err) {
      if (err)
        console.log(err);
      else
        fs.chmodSync(bag.executeScriptPath, '755');
      return next(err);
    }
  );
}

function _executeScripts(bag, next) {
  if (!bag.scriptTaskSteps) return next();

  var exec = spawn('/bin/bash',
    ['-c', bag.executeScriptPath],
    { cwd: bag.buildRootDir }
  );

  exec.stdout.on('data',
    function(data)  {
      console.log(data.toString());
    }
  );

  exec.stderr.on('data',
    function(data)  {
      console.log(data.toString());
    }
  );

  exec.on('close',
    function (exitCode)  {
      return next(exitCode);
    }
  );
}

if (require.main === module) {
  runSh(
    function (err) {
      if (err)
        process.exit(1);
      process.exit(0);
    }
  );
}
