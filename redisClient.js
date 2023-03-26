const redis = require('redis');
const endpoint = process.env.REDIS_ENDPOINT || 'localhost';
const port = process.env.REDIS_PORT || 6379;

const redisOpts = {
    no_ready_check: true,
    socket_keepalive: true,
    retry_strategy: function(options) {
        if (options.error && options.error.code === 'ECONNREFUSED') {
        // End reconnecting on a specific error and flush all commands with
        // a individual error
        return new Error('The server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
        // End reconnecting after a specific timeout and flush all commands
        // with a individual error
        return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
        // End reconnecting with built in error
        return undefined;
        }
        // reconnect after
        return Math.min(options.attempt * 100, 3000);
    }
}

const redisClient = redis.createClient(port, endpoint, redisOpts);

redisClient.on('connect', () => {
    console.log(`Connected to redis server at endpoint: ${endpoint} port: ${port}`);
});
redisClient.on('error', err => {
    console.error(`Error conecting to redis server: ${err}`);
    redisClient.quit();
});

export default redisClient;