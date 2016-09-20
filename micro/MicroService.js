'use strict';
var self = MicroService;
module.exports = self;

var amqp = require('amqp');
var fs = require('fs-extra');
var Adapter = require('../../../_global/shippable/Adapter.js');

function MicroService(params) {
  logger.info('Starting', msName);
  this.AMQPConnection = {};
  this.timeoutLength = 1;
  this.timeoutLimit = 180;
  this.checkHealth = params.checkHealth;
  this.microWorker = params.microWorker;
  this.clusterNodeId = config.clusterNodeId;
  this.pidFile = config.pidFile;
  this.publicAdapter = new Adapter('');
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

      // If this is running on a clusterNode, follow a different path.
      if (this.clusterNodeId)
        queue.subscribe(queueParams, this.disconnectAndProcess.bind(this));
      else
        queue.subscribe(queueParams, this.microWorker);
      return next();
    }.bind(this)
  );
};

MicroService.prototype.disconnectAndProcess =
  function (message, headers, deliveryInfo, ack) {
    async.series([
        this.validateClusterNode.bind(this),
        this.checkPIDFile.bind(this),
        this.createPIDFile.bind(this),
      ],
      function (err) {
        if (err)
          ack.reject(true);
        else {
          ack.acknowledge();
          this.AMQPConnection.closing = true;
          this.AMQPConnection.disconnect();
          this.microWorker(message, headers, deliveryInfo, ack);
        }
      }.bind(this)
    );
  };

MicroService.prototype.validateClusterNode = function(next) {
  logger.verbose(
    util.format('Validating cluster node with :id %s'), this.clusterNodeId
  );

  this.publicAdapter.validateClusterNodeById(this.clusterNodeId,
    function (err, clusterNode) {
      if (err) {
        logger.warn(
          util.format('Failed to :validateClusterNodeById for id: %s',
            this.clusterNodeId)
        );
        return next(true);
      }

      if (clusterNode.action === 'continue')
        return next();
      else
        return next(true);
    }
  );
};

MicroService.prototype.checkPIDFile = function(next) {
  logger.verbose('Checking existance of PID file');

  fs.exists(this.pidFile,
    function(exists) {
      if (exists) {
        logger.warn('PID file already exists, requeuing message');
        return next(true);
      }
      return next();
    }
  );
};

MicroService.prototype.createPIDFile = function(next) {
  logger.verbose('Creating PID file');

  var execContainerName = util.format('shippable-exec-%s', this.clusterNodeId);
  fs.outputFile(this.pidFile, execContainerName,
    function(err) {
      if (err) {
        logger.warn(
          util.format('Failed to create %s file', this.pidFile)
        );
        return next(true);
      }
      return next();
    }
  );
};
