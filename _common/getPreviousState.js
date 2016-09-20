'use strict';
var self = getPreviousState;

module.exports = self;

var fs = require('fs-extra');

function getPreviousState(externalBag, callback) {
  var bag = {
    builderApiAdapter: externalBag.builderApiAdapter,
    resourceId: externalBag.inPayload.resourceId,
    previousStateDir: externalBag.previousStateDir,
    consoleAdapter: externalBag.consoleAdapter
  };

  bag.who = util.format('runSh|_common|%s', self.name);
  logger.verbose(bag.who, 'Inside');

  async.series([
      _checkInputParams.bind(null, bag),
      _getFiles.bind(null, bag),
      _createFiles.bind(null, bag),
      _setPermissions.bind(null, bag)
    ],
    function (err) {
      return callback(err);
  });
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  logger.debug(who, 'Inside');

  bag.consoleAdapter.openCmd('Validating dependencies to get ' +
    'previous Job files');

  var consoleErrors = [];

  if (!bag.resourceId)
    consoleErrors.push(util.format('%s is missing: resourceId', who));

  if (!bag.previousStateDir)
    consoleErrors.push(util.format('%s is missing: previousStateDir', who));

  if (consoleErrors.length > 0) {
    _.each(consoleErrors,
      function (e) {
        var msg = e;
        bag.consoleAdapter.publishMsg(msg);
      }
    );

    bag.consoleAdapter.closeCmd(false);
    return next(true);
  }

  bag.consoleAdapter.publishMsg('Successfully validated ' +
    'dependencies of previous Job');
  bag.consoleAdapter.closeCmd(true);

  return next();
}

function _getFiles(bag, next) {
  var who = bag.who + '|' + _getFiles.name;
  logger.debug(who, 'Inside');

  bag.consoleAdapter.openCmd('Getting files of previous Job');

  var msg;
  var query = '';
  bag.builderApiAdapter.getFilesByResourceId(bag.resourceId, query,
    function (err, data) {
      if (err) {
        msg = util.format('%s, :getFilesByResourceId failed for ' +
          'resourceId: %s with error %s', who, bag.resourceId, err);

        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);

        return next(true);
      }
      bag.stateFileJSON = data;

      if (_.isEmpty(bag.stateFileJSON))
        msg = 'No files found for previous Job';
      else
        msg = 'Successfully received files for previous Job';

      bag.consoleAdapter.publishMsg(msg);
      bag.consoleAdapter.closeCmd(true);

      return next();
    }
  );
}

function _createFiles(bag, next) {
  if (_.isEmpty(bag.stateFileJSON)) return next();

  var who = bag.who + '|' + _createFiles.name;
  logger.debug(who, 'Inside');

  bag.consoleAdapter.openCmd('Saving files of previous Job');

  async.eachLimit(bag.stateFileJSON, 10,
    function (file, nextFile) {
      var path = util.format('%s%s', bag.previousStateDir, file.path);
      fs.outputFile(path, file.contents,
        function (err) {
          if (err) {
            var msg = util.format('%s, Failed to save file:%s with err:%s',
              who, file, err);

            bag.consoleAdapter.publishMsg(msg);

            return nextFile(true);
          }
          return nextFile();
        }
      );
    },
    function (err) {
      if (err)
        bag.consoleAdapter.closeCmd(false);
      else {
        bag.consoleAdapter.publishMsg('Successfully saved' +
          'files for previous Job');
        bag.consoleAdapter.closeCmd(true);
      }

      return next(err);
    }
  );
}

function _setPermissions(bag, next) {
  if (_.isEmpty(bag.stateFileJSON)) return next();

  var who = bag.who + '|' + _setPermissions.name;
  logger.debug(who, 'Inside');

  bag.consoleAdapter.openCmd('Setting permissions on files of previous Job');

  async.eachLimit(bag.stateFileJSON, 10,
    function (file, nextFile) {
      var path = util.format('%s%s', bag.previousStateDir, file.path);
      fs.chmod(path, file.permissions,
        function (err) {
          if (err) {
            var msg = util.format('%s, Failed to set permissions for ' +
              'file:%s with err:%s', who, path, err);

            bag.consoleAdapter.publishMsg(msg);

            return nextFile(true);
          }
          return nextFile();
        }
      );
    },
    function (err) {
      if (err)
        bag.consoleAdapter.closeCmd(false);
      else {
        bag.consoleAdapter.publishMsg('Successfully set permissions for' +
          'files for previous Job');
        bag.consoleAdapter.closeCmd(true);
      }

      return next(err);
    }
  );
}
