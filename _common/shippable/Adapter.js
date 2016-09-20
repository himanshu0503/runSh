'use strict';
var self = ShippableAdapter;
module.exports = self;
var request = require('request');

function ShippableAdapter(token) {
  logger.verbose(util.format('Initializing %s', self.name));
  this.token = token;
  this.baseUrl = config.apiUrl;
  this.headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Authorization': 'apiToken '.concat(token)
  };
}

//#######################   GET  by alphabetical order  ########################
/*
 ------------------------
 Standards:
 ------------------------
 * The parameters for this.method() in getSById should occupy
 a line of their own.

 * We're no longer using `var url`

 * `util.format` needs to be used for all routes that use an Id.

 ------------------------
 Formats:
 ------------------------

 ShippableAdapter.prototype.getSById =
 function (sId, callback) {
 this.get(
 util.format('/S/%s', sId),
 callback
 );
 };

 ShippableAdapter.prototype.getS =
 function (callback) {
 this.get('/S', callback);
 };

 ShippableAdapter.prototype.getSByParentId =
 function (parentId, callback) {
 this.get(
 util.format('/parent/%s/S', parentId),
 callback
 );
 };

 */

ShippableAdapter.prototype.getBuildJobById =
  function (id, callback) {
    this.get(
      util.format('/buildJobs/%s', id),
      callback
    );
  };

ShippableAdapter.prototype.getBuildJobs =
  function (query, callback) {
    this.get(
      util.format('/buildJobs?%s', query),
      callback
    );
  };

ShippableAdapter.prototype.getClusterNodeById =
  function (clusterNodeId, callback) {
    this.get(
      util.format('/clusterNodes/%s', clusterNodeId),
      callback
    );
  };

ShippableAdapter.prototype.getFilesByResourceId =
  function(resourceId, query, callback) {
    this.get(
      util.format('/resources/%s/files?%s', resourceId, query),
      callback
    );
  };

ShippableAdapter.prototype.getSubscriptions =
  function (query, callback) {
    this.get(
      util.format('/subscriptions?%s', query),
      callback
    );
  };

ShippableAdapter.prototype.getSubscriptionIntegrationById =
  function (id, callback) {
    this.get(
      util.format('/subscriptionIntegrations/%s', id),
      callback
    );
  };

ShippableAdapter.prototype.getSystemCodes =
  function (query, callback) {
    this.get(
      '/systemCodes?' + query,
      callback
    );
  };

ShippableAdapter.prototype.postVersion =
  function (json, callback) {
    this.post(
      util.format('/versions'),
      json,
      callback
    );
  };

//#######################  POST  by alphabetical order  ########################

ShippableAdapter.prototype.postBuild =
  function (json, callback) {
    this.post(
      util.format('/builds'),
      json,
      callback
    );
  };

ShippableAdapter.prototype.postBuildJobConsoles =
  function (json, callback) {
    this.post(
      util.format('/buildJobConsoles'),
      json,
      callback
    );
  };

ShippableAdapter.prototype.postBuildJob =
  function (json, callback) {
    this.post(
      util.format('/buildJobs'),
      json,
      callback
    );
  };

ShippableAdapter.prototype.postFilesByResourceId =
  function (resourceId, json, callback) {
    this.post(
      util.format('/resources/%s/files', resourceId),
      json,
      callback
    );
  };

ShippableAdapter.prototype.postVersion =
  function (json, callback) {
    this.post(
      '/versions',
      json,
      callback
    );
  };

ShippableAdapter.prototype.postToVortex =
  function (message, callback) {
    this.post(
      '/vortex',
      message,
      callback
    );
  };

ShippableAdapter.prototype.postToSUVortex =
  function (message, callback) {
    this.post(
      '/vortexSU',
      message,
      callback
    );
  };

//#######################  PUT  by alphabetical order  ########################

ShippableAdapter.prototype.putBuildById =
  function (id, json, callback) {
    this.put(
      util.format('/builds/%s', id),
      json,
      callback
    );
  };

ShippableAdapter.prototype.putBuildJobById =
  function (id, json, callback) {
    this.put(
      util.format('/buildJobs/%s', id),
      json,
      callback
    );
  };

ShippableAdapter.prototype.putClusterNodeById =
  function (clusterNodeId, clusterNode, callback) {
    this.put(
      util.format('/clusterNodes/%s', clusterNodeId),
      clusterNode,
      callback
    );
  };

ShippableAdapter.prototype.validateClusterNodeById =
  function (clusterNodeId, callback) {
    this.get(
      util.format('/clusterNodes/%s/validate', clusterNodeId),
      callback
    );
  };

//#################### Generic request calls ##############################

ShippableAdapter.prototype.get =
  function (relativeUrl, callback) {
    var bag = {};
    bag.opts = {
      method: 'GET',
      url: this.baseUrl.concat(relativeUrl),
      headers: this.headers
    };
    bag.who = util.format('%s call to %s', bag.opts.method, bag.opts.url);
    logger.debug(util.format('Starting %s', bag.who));

    async.series([
        _performCall.bind(null, bag),
        _parseBody.bind(null, bag)
      ],
      function () {
        callback(bag.err, bag.parsedBody, bag.res);
      }
    );
  };

ShippableAdapter.prototype.post =
  function (relativeUrl, json, callback) {
    var bag = {};
    bag.opts = {
      method: 'POST',
      url: this.baseUrl.concat(relativeUrl),
      headers: this.headers,
      json: json
    };
    bag.who = util.format('%s call to %s', bag.opts.method, bag.opts.url);
    logger.debug(util.format('Starting %s', bag.who));

    async.series([
        _performCall.bind(null, bag),
        _parseBody.bind(null, bag)
      ],
      function () {
        callback(bag.err, bag.parsedBody, bag.res);
      }
    );
  };

ShippableAdapter.prototype.put =
  function (relativeUrl, json, callback) {
    var bag = {};
    bag.opts = {
      method: 'PUT',
      url: this.baseUrl.concat(relativeUrl),
      headers: this.headers,
      json: json
    };
    bag.who = util.format('%s call to %s', bag.opts.method, bag.opts.url);
    logger.debug(util.format('Starting %s', bag.who));

    async.series([
        _performCall.bind(null, bag),
        _parseBody.bind(null, bag)
      ],
      function () {
        callback(bag.err, bag.parsedBody, bag.res);
      }
    );
  };

ShippableAdapter.prototype.delete =
  function (relativeUrl, callback) {
    var bag = {};
    bag.opts = {
      method: 'DELETE',
      url: this.baseUrl.concat(relativeUrl),
      headers: this.headers
    };
    bag.who = util.format('%s call to %s', bag.opts.method, bag.opts.url);
    logger.debug(util.format('Starting %s', bag.who));

    async.series([
        _performCall.bind(null, bag),
        _parseBody.bind(null, bag)
      ],
      function () {
        callback(bag.err, bag.parsedBody, bag.res);
      }
    );
  };

function _performCall(bag, next) {
  var who = bag.who + '|' + _performCall.name;
  logger.debug(who, 'Inside');

  bag.startedAt = Date.now();
  bag.timeoutLength = 1;
  bag.timeoutLimit = 180;

  __attempt(bag, next);

  function __attempt(bag, callback) {
    request(bag.opts,
      function (err, res, body) {
        var interval = Date.now() - bag.startedAt;

        if (res)
          logger.debug(
            util.format('%s took %s & returned status %s', bag.who, interval,
              res.statusCode)
          );

        if (res && res.statusCode > 299)
          err = err || res.statusCode;

        if ((res && res.statusCode > 299) || err) {
          if (res && res.statusCode >= 500) {
            logger.error(
              util.format('%s returned error. Retrying in %s seconds',
                bag.who, bag.timeoutLength*2)
            );
            bag.timeoutLength *= 2;
            if (bag.timeoutLength > bag.timeoutLimit)
              bag.timeoutLength = 1;

            setTimeout(function () {
              __attempt(bag, callback);
            }, bag.timeoutLength * 1000);

            return;
          } else {
            logger.warn(util.format('%s returned status %s with error %s',
              bag.who, res && res.statusCode, err));
            bag.err = err;
          }
        }
        bag.res = res;
        bag.body = body;
        callback();
      }
    );
  }
}

function _parseBody(bag, next) {
  var who = bag.who + '|' + _parseBody.name;
  logger.debug(who, 'Inside');

  if (bag.body) {
    if (typeof bag.body === 'object') {
      bag.parsedBody = bag.body;
    } else {
      try {
        bag.parsedBody = JSON.parse(bag.body);
      } catch (e) {
        logger.error('Unable to parse bag.body', bag.body, e);
        bag.err = e;
      }
    }
  }
  return next();
}
