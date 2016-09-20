'use strict';
var self = inStep;
module.exports = self;

function inStep(externalBag, dependency, buildInDir, callback) {
  var bag = {
    resBody: {},
    dependency: dependency,
    buildInDir: buildInDir,
    builderApiAdapter: externalBag.builderApiAdapter,
    consoleAdapter: externalBag.consoleAdapter
  };

  bag.who = 'stepExec|_common|resources|image|' + self.name;
  logger.verbose(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag)
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

  if (!bag.dependency.versionDependencyPropertyBag)
    consoleErrors.push(
      util.format('%s is missing: dependency.versionDependencyPropertyBag', who)
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
