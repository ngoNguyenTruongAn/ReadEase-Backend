const client = require('prom-client');

const ws_connection_count = new client.Gauge({
  name: 'ws_connection_count',
  help: 'Active websocket connections',
});

const trajectory_events_received = new client.Counter({
  name: 'trajectory_events_received',
  help: 'Total mouse trajectory points received',
});

const redis_flush_latency = new client.Histogram({
  name: 'redis_flush_latency',
  help: 'Redis flush latency',
});

const ws_processing_latency = new client.Histogram({
  name: 'ws_processing_latency',
  help: 'WebSocket event processing latency',
});

module.exports = {
  ws_connection_count,
  trajectory_events_received,
  redis_flush_latency,
  ws_processing_latency,
};
