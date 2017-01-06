'use strict';
var self = MicroService;
module.exports = self;

var amqp = require('amqp');
var fs = require('fs-extra');
var Adapter = require('../_common/shippable/Adapter.js');

function MicroService(params) {
  logger.info('Starting', msName);
  this.AMQPConnection = {};
  this.queue = {};
  this.ackWaitTimeMS = 2 * 1000;  // 2 seconds
  this.timeoutLength = 1;
  this.timeoutLimit = 180;
  this.checkHealth = params.checkHealth;
  this.microWorker = params.microWorker;
  this.nodeId = config.nodeId;
  this.pidFile = config.pidFile;
  this.publicAdapter = new Adapter('');
  this.isSystemNode = false;

  if (parseInt(config.nodeTypeCode) === nodeTypeCodes.system)
    this.isSystemNode = true;

  return this.init();
}

MicroService.prototype.init = function () {
  logger.verbose('Initializing', msName);
  async.series([
      this.checkHealth.bind(this),
      this.establishQConnection.bind(this),
      this.connectExchange.bind(this),
      this.connectToQueue.bind(this)
    ],
    function (err) {
      if (err)
        return this.error(err);
    }.bind(this)
  );
};

MicroService.prototype.establishQConnection = function (next) {
  logger.verbose(util.format('Connecting %s to Q %s', msName, config.amqpUrl));
  this.AMQPConnection = amqp.createConnection({
      url: config.amqpUrl,
      heartbeat: 60
    }, {
      defaultExchangeName: config.amqpExchange,
      reconnect: false
    }
  );

  this.AMQPConnection.on('ready',
    function () {
      logger.verbose(
        util.format('Connected %s to Q %s', msName, config.amqpUrl)
      );
      return next();
    }.bind(this)
  );

  this.AMQPConnection.on('error',
    function (connection, err) {
      if (connection && !connection.closing) {
        logger.error(
          util.format('Failed to connect %s to Q %s', msName, config.amqpUrl)
        );
        return this.error(err);
      }
    }.bind(this, this.AMQPConnection)
  );

  this.AMQPConnection.on('close',
    function (connection) {
      logger.verbose(
        util.format('Closed connection from %s to Q %s', msName,
          config.amqpUrl)
      );

      // If this is not a close connection event initiated by us, we should try
      // to reconnect.
      if (!connection.closing) {
        this.timeoutLength = 1;
        this.timeoutLimit = 180;
        return this.init();
      }
    }.bind(this, this.AMQPConnection)
  );
};

MicroService.prototype.error = function (err) {
  logger.error(err);
  logger.verbose(
    util.format('Since an error occurred, re-connecting %s to Q %s',
      msName, config.amqpUrl)
  );
  async.series([
      this.disconnectQConnection.bind(this)
    ],
    function () {
      this.retry();
    }.bind(this)
  );
};

MicroService.prototype.disconnectQConnection = function (next) {
  try {
    this.AMQPConnection.closing = true;
    this.AMQPConnection.disconnect();
  } catch (ex) {
    logger.warn(
      util.format('Failed to close connection from %s to Q %s', msName,
        config.amqpUrl)
    );
  }
  this.AMQPConnection = {};
  return next();
};

MicroService.prototype.retry = function () {
  this.timeoutLength *= 2;
  if (this.timeoutLength > this.timeoutLimit)
    this.timeoutLength = 1;

  logger.verbose(
    util.format('Waiting for %s seconds before re-connecting %s to Q %s',
      this.timeoutLength, msName, config.amqpUrl)
  );
  setTimeout(this.init.bind(this), this.timeoutLength * 1000);
};

MicroService.prototype.connectExchange = function (next) {
  logger.verbose(
    util.format('Connecting %s to Exchange %s', msName, config.amqpExchange)
  );
  this.AMQPConnection.exchange(
    config.amqpExchange, {
      passive: true,
      confirm: true
    },
    function (exchange) {
      logger.verbose(
        util.format('Connected %s to Exchange %s', msName, exchange.name)
      );
      return next();
    }.bind(this)
  );
};

MicroService.prototype.connectToQueue = function (next) {
  logger.verbose(
    util.format('Connecting %s to Queue %s', msName, config.inputQueue)
  );
  var queueParams = {
    passive: true
  };

  this.AMQPConnection.queue(config.inputQueue, queueParams,
    function (queue) {
      queue.bind(config.amqpExchange, queue.name);
      logger.verbose(
        util.format('%s is listening to Queue %s', msName, queue.name)
      );
      var queueParams = {
        ack: true,
        prefetchCount: 1
      };

      this.queue = queue;
      queue.subscribe(queueParams, this.disconnectAndProcess.bind(this))
        .addCallback(
          function (ok) {
            this.consumerTag = ok.consumerTag;
          }.bind(this)
        );

      return next();
    }.bind(this)
  );
};

MicroService.prototype.disconnectAndProcess =
  function (message, headers, deliveryInfo, ack) {
    logger.verbose(
      util.format('Disconnecting from queue: %s and processing',
      config.inputQueue)
    );

    if (!this.consumerTag) {
      logger.warn('consumerTag not available yet, rejecting and listening.');
      ack.reject(true);
      return;
    }

    var bag = {
      who: util.format('runSh|micro|%s', self.name),
      ack: ack,
      ackMessage: true,
      ackWaitTimeMS: this.ackWaitTimeMS,
      queue: this.queue,
      nodeId: this.nodeId,
      pidFile: this.pidFile,
      consumerTag: this.consumerTag,
      isSystemNode: this.isSystemNode,
      publicAdapter: this.publicAdapter
    };

    async.series([
        _validateClusterNode.bind(null, bag),
        _validateSystemNode.bind(null, bag),
        _checkPIDFile.bind(null, bag),
        _createPIDFile.bind(null, bag),
        _unsubscribeFromQueue.bind(null, bag),
        _ackMessage.bind(null, bag),
        _rejectMessage.bind(null, bag)
      ],
      function () {
        if (bag.ackMessage) {
          this.AMQPConnection.closing = true;
          this.AMQPConnection.disconnect();
          this.microWorker(message, headers, deliveryInfo, ack);
        }
      }.bind(this)
    );
  };

function _validateClusterNode(bag, next) {
  if (bag.isSystemNode) return next();

  var who = bag.who + '|' + _validateClusterNode.name;
  logger.debug(who, 'Inside');

  bag.publicAdapter.validateClusterNodeById(bag.nodeId,
    function (err, clusterNode) {
      if (err) {
        logger.warn(
          util.format(who, 'failed to :validateClusterNodeById for id: %s',
            bag.nodeId)
        );
        bag.ackMessage = false;
        return next();
      }

      if (clusterNode.action !== 'continue')
        bag.ackMessage = false;

      return next();
    }
  );
}

function _validateSystemNode(bag, next) {
  if (!bag.isSystemNode) return next();

  var who = bag.who + '|' + _validateSystemNode.name;
  logger.debug(who, 'Inside');

  bag.publicAdapter.validateSystemNodeById(bag.nodeId,
    function (err, systemNode) {
      if (err) {
        logger.warn(
          util.format(who, 'failed to :validateSystemNodeById for id: %s',
            bag.nodeId)
        );
        bag.ackMessage = false;
        return next();
      }

      if (systemNode.action !== 'continue')
        bag.ackMessage = false;

      return next();
    }
  );
}

function _checkPIDFile(bag, next) {
  if (!bag.ackMessage) return next();

  var who = bag.who + '|' + _checkPIDFile.name;
  logger.debug(who, 'Inside');

  fs.exists(bag.pidFile,
    function (exists) {
      if (exists) {
        logger.warn(who, 'PID file already exists, message will be rejected');
        bag.ackMessage = false;
      }

      return next();
    }
  );
}

function _createPIDFile(bag, next) {
  if (!bag.ackMessage) return next();

  var who = bag.who + '|' + _createPIDFile.name;
  logger.debug(who, 'Inside');

  var execContainerName = util.format('shippable-exec-%s', bag.nodeId);
  fs.outputFile(bag.pidFile, execContainerName,
    function(err) {
      if (err) {
        logger.warn(who,
          util.format('failed to create %s PID file', this.pidFile)
        );
        bag.ackMessage = false;
      }

      return next();
    }
  );
}

function _unsubscribeFromQueue(bag, next) {
  if (!bag.ackMessage) return next();

  var who = bag.who + '|' + _unsubscribeFromQueue.name;
  logger.debug(who, 'Inside');

  bag.queue.unsubscribe(bag.consumerTag)
    .addCallback(
      function () {
        return next();
      }
    );
}

function _ackMessage(bag, next) {
  if (!bag.ackMessage) return next();

  var who = bag.who + '|' + _ackMessage.name;
  logger.debug(who, 'Inside');

  bag.ack.acknowledge();
  setTimeout(
    function () {
      return next();
    },
    bag.ackWaitTimeMS
  );
}

function _rejectMessage(bag, next) {
  if (bag.ackMessage) return next();

  var who = bag.who + '|' + _rejectMessage.name;
  logger.debug(who, 'Inside');

  bag.ack.reject(true);
  return next();
}
