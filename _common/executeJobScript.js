'use strict';
var self = executeJobScript;
module.exports = self;

var spawn = require('child_process').spawn;

function executeJobScript(externalBag, callback) {
  var bag = {
    scriptPath: externalBag.scriptPath,
    options: externalBag.options || {},
    exitCode: 1,
    consoleAdapter: externalBag.consoleAdapter
  };

  bag.who = 'runSh|_common|' + self.name;
  logger.verbose(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _executeTask.bind(null, bag)
    ],
    function () {
      logger.verbose(bag.who, 'Completed');
      return callback(bag.exitCode);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  logger.debug(who, 'Inside');

  return next();
}

function _executeTask(bag, next) {
  var who = bag.who + '|' + _executeTask.name;
  logger.debug(who, 'Inside');

  var exec = spawn('/bin/bash', ['-c', bag.scriptPath + ' 2>&1'], bag.options);
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
    function(code)  {
      bag.exitCode = code;
      return next();
    }
  );
}

function __parseLogLine(bag, line) {
  var grpStartHeader = '__SH__GROUP__START__';
  var grpEndHeader = '__SH__GROUP__END__';
  var cmdStartHeader = '__SH__CMD__START__';
  var cmdEndHeader = '__SH__CMD__END__';


  var lineSplit = line.split('|');

  var cmdJSON = null;
  var grpJSON = null;
  var isSuccess = null;

  if (lineSplit[0] === grpStartHeader) {
    grpJSON = JSON.parse(lineSplit[1]);
    bag.consoleAdapter.openGrp(lineSplit[2], grpJSON.is_shown);
  } else if (lineSplit[0] === grpEndHeader) {
    grpJSON = JSON.parse(lineSplit[1]);
    isSuccess = grpJSON.exitcode === '0';
    bag.consoleAdapter.closeGrp(isSuccess);
  }else if (lineSplit[0] === cmdStartHeader) {
    bag.consoleAdapter.openCmd(lineSplit[2]);
  } else if (lineSplit[0] === cmdEndHeader) {
    cmdJSON = JSON.parse(lineSplit[1]);
    isSuccess = cmdJSON.exitcode === '0';
    bag.consoleAdapter.closeCmd(isSuccess);
  } else {
    bag.consoleAdapter.publishMsg(line);
  }
}
