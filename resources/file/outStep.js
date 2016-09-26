'use strict';
var self = outStep;
module.exports = self;

var fs = require('fs-extra');

function outStep(externalBag, dependency, buildOutDir, callback) {
  var bag = {
    resBody: {},
    dependency: dependency,
    buildOutDir: buildOutDir,
    builderApiAdapter: externalBag.builderApiAdapter,
    consoleAdapter: externalBag.consoleAdapter,
    safeSkip: false,
    propertyBag: {}
  };

  bag.who = 'runSh|resources|file|' + self.name;
  logger.verbose(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _readFile.bind(null, bag),
      _readVersionName.bind(null, bag),
      _postNewVersion.bind(null, bag)
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

  if (!bag.dependency.sourceName)
    consoleErrors.push(
      util.format('%s is missing: dependency.sourceName', who)
    );

  if (!bag.dependency.version.versionName)
    consoleErrors.push(
      util.format('%s is missing: dependency.version.versionName', who)
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

function _readFile(bag, next) {
  var who = bag.who + '|' + _readFile.name;
  logger.debug(who, 'Inside');

  bag.consoleAdapter.openCmd('Reading resource file');
  fs.readJson('/build/OUT/' + bag.dependency.name + '/version.json',
    function (err, version) {
      if (err) {
        bag.consoleAdapter.publishMsg('Failed to read resource file.' +
          ' Hence skipping.');
        bag.consoleAdapter.closeCmd(false);
        bag.safeSkip = true;
        return next();
      }

      bag.version = version;
      bag.consoleAdapter.publishMsg('Successfully read resource file');
      bag.consoleAdapter.closeCmd(true);
      return next();
    }
  );
}

function _readVersionName(bag, next) {
  if (bag.safeSkip) return next();

  var who = bag.who + '|' + _readVersionName.name;
  logger.debug(who, 'Inside');

  bag.consoleAdapter.openCmd('Reading resource env file');
  var envFilePath = '/build/state/' + bag.dependency.name + '.env';
  try {
    var envFile = fs.readFileSync(envFilePath).toString();
    var lines = envFile.split('\n');

    _.each(lines,
      function (line) {
        var nameAndValue = line.split('=');
        var key = nameAndValue[0];
        var value = nameAndValue[1];
        if (key === 'versionName')
          bag.newVersionName = value;
        else
          bag.propertyBag[key] = value;
      }
    );
  } catch (err) {
    bag.consoleAdapter.publishMsg(
      util.format('Could not parse file %s. Hence Skipping.',
        envFilePath));
    bag.consoleAdapter.publishMsg(
      util.format('unable to read file %s.env', bag.dependency.name));
    bag.consoleAdapter.closeCmd(false);
    bag.safeSkip = true;
    return next();
  }

  if (bag.newVersionName)
    bag.consoleAdapter.publishMsg(
      util.format('Found versionName %s', bag.newVersionName));
  else
    bag.consoleAdapter.publishMsg('No versionName found');

  bag.consoleAdapter.closeCmd(true);
  return next();
}

function _postNewVersion(bag, next) {
  if (bag.safeSkip) return next();

  var oldVersionName = bag.version.version && bag.version.version.versionName;
  if (!bag.newVersionName || oldVersionName === bag.newVersionName)
    return next();

  var who = bag.who + '|' + _postNewVersion.name;
  logger.debug(who, 'Inside');

  bag.consoleAdapter.openCmd('Posting new version');
  var newVersion = {
    resourceId: bag.version.resourceId,
    propertyBag: bag.propertyBag,
    versionName: bag.newVersionName,
    projectId: bag.version.projectId
  };

  bag.builderApiAdapter.postVersion(newVersion,
    function (err, version) {
      var msg;
      if (err) {
        msg = util.format('%s, Failed to post version for resourceId: %s',
          who, bag.version.resourceId, err);
        bag.consoleAdapter.publishMsg(msg);
        bag.consoleAdapter.closeCmd(false);
        return next(true);
      }

      bag.version = version;
      msg = util.format('Post version for resourceId: %s succeeded with ' +
        ' version %s', bag.version.resourceId, util.inspect(bag.version)
      );
      bag.consoleAdapter.publishMsg(msg);
      bag.consoleAdapter.closeCmd(true);
      return next();
    }
  );
}
