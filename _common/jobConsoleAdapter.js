'use strict';

var self = Adapter;
module.exports = self;

var uuid = require('node-uuid');
var ShippableAdapter = require('./shippable/Adapter.js');

function Adapter(apiToken, jobId) {
  this.who = 'runSh|_common|jobConsoleAdapter|jobId:' + jobId;
  this.jobId = jobId;
  this.startTimeInMicroSec = new Date().getTime() * 1000;
  var processStartTime = process.hrTime();
  this.processStartTimeInMicroSec =
    processStartTime[0] * 1e6 + processStartTime[1] / 1e3;
  this.ShippableAdapter = new ShippableAdapter(apiToken);
  this.batchSize = 10;
  this.buffer = [];
  this.bufferTimeInterval = 3000;
  this.bufferTimer = null;
  this.pendingApiCalls = 0;
}

Adapter.prototype.openGrp = function (consoleGrpName) {
  var that = this;
  var who = that.who + '|_openGrp';

  that.consoleGrpName = consoleGrpName;
  that.consoleGrpId = uuid.v4();

  if (_.isEmpty(consoleGrpName))
    throw new ActErr(who, ActErr.ParamNotFound,
      'Missing param :consoleGrpName');

  var consoleGrp = {
    jobId: that.jobId,
    consoleId: that.consoleGrpId,
    parentConsoleId: 'root',
    type: 'grp',
    message: that.consoleGrpName,
    timestamp: that._getTimestamp(),
    isShown: true
  };

  that.buffer.push(consoleGrp);
  that._postToJobConsole(true);
};

Adapter.prototype.closeGrp = function (isSuccess) {
  var that = this;

  //The grp is already closed
  if (!that.consoleGrpName)
    return;

  if (!_.isBoolean(isSuccess)) isSuccess = true;

  that.closeCmd();

  var consoleGrp = {
    jobId: that.jobId,
    consoleId: that.consoleGrpId,
    parentConsoleId: 'root',
    type: 'grp',
    message: that.consoleGrpName,
    timestamp: that._getTimestamp(),
    timestampEndedAt: that._getTimestamp(),
    isSuccess: isSuccess,
    isShown: true
  };

  that.buffer.push(consoleGrp);
  that._postToJobConsole(true);
  that.consoleGrpName = null;
  that.consoleGrpId = null;
};

Adapter.prototype.openCmd = function (consoleCmdName) {
  var that = this;
  var who = that.who + '|_openCmd';

  if (_.isEmpty(consoleCmdName))
    throw new ActErr(who, ActErr.ParamNotFound,
      'Missing param :consoleCmdName');

  that.consoleCmdName = consoleCmdName;
  that.consoleCmdId = uuid.v4();

  var consoleGrp = {
    jobId: that.jobId,
    consoleId: that.consoleCmdId,
    parentConsoleId: that.consoleGrpId,
    type: 'cmd',
    message: that.consoleCmdName,
    timestamp: that._getTimestamp(),
    isShown: true
  };

  that.buffer.push(consoleGrp);
  that._postToJobConsole(true);
};

Adapter.prototype.closeCmd = function (isSuccess) {
  var that = this;

  //The cmd is already closed
  if (!that.consoleCmdName)
    return;

  if (!_.isBoolean(isSuccess)) isSuccess = true;

  var consoleGrp = {
    jobId: that.jobId,
    consoleId: that.consoleCmdId,
    parentConsoleId: that.consoleGrpId,
    type: 'cmd',
    message: that.consoleCmdName,
    timestamp: that._getTimestamp(),
    timestampEndedAt: that._getTimestamp(),
    isSuccess: isSuccess,
    isShown: false
  };

  that.buffer.push(consoleGrp);
  that._postToJobConsole(true);
  that.consoleCmdName = null;
  that.consoleCmdId = null;
};

Adapter.prototype.publishMsg = function (message) {
  var that = this;

  var consoleGrp = {
    jobId: that.jobId,
    consoleId: uuid.v4(),
    parentConsoleId: that.consoleCmdId,
    type: 'msg',
    message: message,
    timestamp: that._getTimestamp(),
    isShown: true
  };

  that.buffer.push(consoleGrp);
  that._postToJobConsole(false);
};

Adapter.prototype._postToJobConsole = function (forced) {
  var that = this;
  var who = that.who + '|_postToJobConsole';

  if (that.buffer.length > that.batchSize || forced) {
    if (that.bufferTimer) {
      // If a timeout has been set for the buffer, clear it.
      clearTimeout(that.bufferTimer);
      that.bufferTimer = null;
    }

    var consoles = that.buffer.splice(0, that.buffer.length);

    if (consoles.length === 0)
      return;

    var body = {
      jobId: that.jobId,
      jobConsoles: consoles
    };

    that.pendingApiCalls ++;
    that.ShippableAdapter.postjobConsoles(body,
      function (err) {
        that.pendingApiCalls --;
        if (err)
          logger.error(who, 'postjobConsoles Failed', err);
        logger.debug(who, 'Succeeded');
      }
    );
  } else if (!that.bufferTimer) {
    // Set a timeout that will clear the buffer in three seconds if nothing has.
    that.bufferTimer = setTimeout(
      function () {
        this._postToJobConsole(true);
      }.bind(that),
      that.bufferTimeInterval);
  }
};

Adapter.prototype.getPendingApiCallCount = function() {
  var that = this;
  return that.pendingApiCalls;
};

Adapter.prototype._getTimestamp = function () {
  var that = this;
  var currentProcessTime = process.hrTime();
  
  return that.startTimeInMicroSec +
    (currentProcessTime[0] * 1e6 + currentProcessTime[1]/1e3) -
      that.processStartTimeInMicroSec;
};
