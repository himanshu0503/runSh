'use strict';
var self = executeJobScript;
module.exports = self;

var spawn = require('child_process').spawn;
var fs = require('fs-extra');

function executeJobScript(externalBag, callback) {
  var bag = {
    consoleAdapter: externalBag.consoleAdapter,
    steps: externalBag.steps,
    mexecFileNameWithPath: externalBag.mexecFileNameWithPath,
    isFailedJob: false,
    continueNextStep: true
  };

  bag.who = 'runSh|_common|' + self.name;
  logger.verbose(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _executeSteps.bind(null, bag)
    ],
    function () {
      logger.verbose(bag.who, 'Completed');
      return callback(bag.isFailedJob);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  logger.debug(who, 'Inside');

  return next();
}

function _executeSteps(bag, next) {
  var who = bag.who + '|' + _executeSteps.name;
  logger.debug(who, 'Inside');

  async.eachSeries(bag.steps,
    function(step, nextStep) {
      bag.currentStep = step;
      async.series([
          __writeStepToFile.bind(null, bag),
          __executeTask.bind(null, bag)
        ],
        function(err) {
          return nextStep(err);
        }
      );
    },
    function(err) {
      return next(err);
    }
  );
}

function __writeStepToFile(bag, done) {
  if (!bag.continueNextStep) return done();

  var who = bag.who + '|' + __writeStepToFile.name;
  logger.debug(who, 'Inside');

  fs.writeFile(bag.mexecFileNameWithPath, bag.currentStep.script,
    function (err) {
      if (err)
        return done(err);
      fs.chmodSync(bag.mexecFileNameWithPath, '755');
      return done();
    }
  );
}

function __executeTask(bag, done) {
  if (!bag.continueNextStep) return done();

  var who = bag.who + '|' + __executeTask.name;
  logger.debug(who, 'Inside');

  var exec = spawn('/bin/bash', ['-c', bag.mexecFileNameWithPath + ' 2>&1'],
    {});
  exec.stdout.on('data',
    function(data)  {
      _.each(data.toString().split('\n'),
        function(consoleLine) {
          if (!_.isEmpty(consoleLine)) {
            __parseLogLine(bag, consoleLine);
          }
        }
      );
    }
  );

  exec.on('close',
    function()  {
      return done();
    }
  );
}

function __parseLogLine(bag, line) {
  var lineSplit = line.split('|');

  var cmdJSON = null;
  var grpJSON = null;
  var isSuccess = null;

  if (lineSplit[0] === '__SH__GROUP__START__') {
    grpJSON = JSON.parse(lineSplit[1]);
    bag.consoleAdapter.openGrp(lineSplit[2], grpJSON.is_shown);
  } else if (lineSplit[0] === '__SH__GROUP__END__') {
    grpJSON = JSON.parse(lineSplit[1]);
    isSuccess = grpJSON.exitcode === '0';
    bag.consoleAdapter.closeGrp(isSuccess, grpJSON.is_shown);
  } else if (lineSplit[0] === '__SH__CMD__START__') {
    bag.consoleAdapter.openCmd(lineSplit[2]);
  } else if (lineSplit[0] === '__SH__CMD__END__') {
    cmdJSON = JSON.parse(lineSplit[1]);
    isSuccess = cmdJSON.exitcode === '0';
    bag.consoleAdapter.closeCmd(isSuccess);
  } else if (lineSplit[0] === '__SH__SCRIPT_END_FAILURE__') {
    bag.isFailedJob = true;
  } else if (lineSplit[0] === '__SH__SHOULD_NOT_CONTINUE__') {
    bag.continueNextStep = false;
  } else {
    bag.consoleAdapter.publishMsg(line);
  }
}
