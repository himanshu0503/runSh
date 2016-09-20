'use strict';
var self = setupStepExec;
module.exports = self;

function setupStepExec() {
  global.config.jobType = process.env.JOB_TYPE;
  global.config.clusterNodeId = process.env.CLUSTER_NODE_ID;
  global.config.pidFile = '/var/run/job.pid';
  if (global.config.jobType === 'runSh') {
    global.config.inputQueue = process.env.LISTEN_QUEUE;
    global.config.amqpUrl = process.env.SHIPPABLE_AMQP_URL;
  } else {
    global.config.inputQueue = util.format('steps.%s', global.config.jobType);
  }
}
