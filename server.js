//#!/usr/bin/env node
// Study Together server
"use strict";

const http = require('http');
const WebSocketServer = require('websocket').server;
const express = require('express');

// Logging function
function log(text) {
  const time = new Date();
  console.log("[" + time.toLocaleTimeString() + "] " + text);
}

// Redis //
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
    log(`Connected to redis server at endpoint: ${endpoint} port: ${port}`);
});
redisClient.on('error', err => {
    log(`Error conecting to redis server: ${err}`);
    redisClient.quit();
});

// Set a new key in redis
const set = (key, value, isParsable) => {
  // Remove keepaliveTimeoutID from connections
  // This is to prevent the server from crashing
  // Due to a circular reference in the connection object
  for (var i = 0; i < value.length; i++) {
    if (value[i].hasOwnProperty('_keepaliveTimeoutID')) {
      value[i]._keepaliveTimeoutID = null;
    }
  }
  value = isParsable ? JSON.stringify(value) : value
  return new Promise((resolve, reject) => {
    redisClient.set(key, value, function(err, response) {
      if (err) {
        return reject(err)
      }
      return resolve(response)
    })
  })
}

// Get a key from redis
const get = (key, isParsable) => {
  return new Promise((resolve, reject) => {
    redisClient.get(key, (err, result) => {
      if (err) {
        return reject(err)
      }
      const response = isParsable ? JSON.parse(result) : result
      return resolve(_connections)
    })
  })
}

// Get all keys from redis
const getAll = (keys, isParsable) => {
  return new Promise((resolve, reject) => {
    redisClient.mget(keys, (err, result) => {
      if (err) {
        return reject(err)
      }
      if (Array.isArray(keys) && Array.isArray(result)) {
        const response = keys.reduce(
          (prev, current, index) => ({
            ...prev,
            [current]: result[index]
          }),
          {}
        )
        return resolve(response)
      }
      const response = isParsable ? JSON.parse(result) : result
      return resolve(response)
    })
  })
}

// Get all keys matching pattern from redis
const getKeys = pattern => {
  return new Promise((resolve, reject) => {
    redisClient.keys(pattern, function(err, keys) {
      if (err) {
        return reject(err)
      }
      return resolve(keys)
    })
  })
}

// Delete a key from redis
const del = key => {
  return new Promise((resolve, reject) => {
    return redisClient.del(key, function(err, response) {
      if (err) {
        return reject(err)
      }
      return resolve(response)
    })
  })
}

// Delete all keys except those matching pattern from redis
const delAllKeysExcept = (pattern, key) => {
  getKeys(pattern).then(keys => {
    for (let i = 0; i < keys.length; i++) {
      const currentKey = keys[i]
      if (currentKey !== key) {
        del(currentKey)
      }
    }
  })
}


// Used for managing the text chat user list.
var nextID = Date.now();
var appendToMakeUnique = 1;
var _connections = [];

// Initialize vars in redis
async function initRedis() {
  let connectionArray = await get('connectionArray', true);
  if (
      !connectionArray 
      || connectionArray === null 
      || connectionArray === 'null'
      || connectionArray === '[object Object]'
      ) {
    await set('connectionArray', [], true);
  };
}

// Get connectionsArray from redis
async function getConnectionArray() {
  const connectionArray = await get('connectionArray', true);
  return connectionArray;
}

// Set connectionsArray in redis
async function setConnectionArray(connectionArray) {
  await set('connectionArray', connectionArray, true);
  _connections = connectionArray;
}

// Server //

// Serve static files for get requests
const app = express();
app.use(express.static('public'));
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});
app.listen(8080, function() {
  log('Client app listening on port 8080');
});

// CORS
function originIsAllowed(origin) {
  return true;    // Accept all connections for demonstration
}

// Scans the list of connections and return the one for the specified
async function isUsernameUnique(name) {
  var isUnique = true;
  var _connectionArray = await getConnectionArray();
  for (var i=0; i<_connectionArray.length; i++) {
    if (_connectionArray[i].username === name) {
      isUnique = false;
      break;
    }
  }
  return isUnique;
}

// Sends a message to one user. The message is a JSON string
async function sendToOneUser(target, msgString) {
  var _connectionArray = await getConnectionArray();
  for (var i=0; i<_connectionArray.length; i++) {
    if (_connectionArray[i].username === target) {
      if(!_connectionArray[i].sendUTF) return true; // If the connection is dummy, return true after match
      _connectionArray[i].sendUTF(msgString);
      break;
    }
  }
}

// Scan the list of connections and return the one matching the clientID
async function getConnectionForID(id) {
  var connect = null;
  var _connectionArray = await getConnectionArray();
  for (var i=0; i<_connectionArray.length; i++) {
    if (_connectionArray[i].clientID === id) {
      connect = _connectionArray[i];
      break;
    }
  }
  return connect;
}

// Builds a message object of type "userlist" which contains all connected users
async function makeUserListMessage() {
  var userListMsg = {
    type: "userlist",
    users: []
  };
  var _connectionArray = await getConnectionArray();
  // Add the users to the list
  for (var i=0; i<_connectionArray.length; i++) {
    userListMsg.users.push(_connectionArray[i].username);
  }
  return userListMsg;
}

// Sends a "userlist" message to all chat members, for updating the user list
async function sendUserListToAll() {
  var userListMsg = await makeUserListMessage();
  var userListMsgStr = JSON.stringify(userListMsg);
  var _connectionArray = await getConnectionArray();
  for (var i=0; i<_connectionArray.length; i++) {
    if(!_connectionArray[i].sendUTF) return true; // If the connection is dummy, return true after match
    _connectionArray[i].sendUTF(userListMsgStr);
  }
}

// Initiate the http server
var webServer = null;
try {
  webServer = http.createServer({}, handleWebRequest);
} catch(err) {
  webServer = null;
  log(`Error attempting to create HTTP(s) server: ${err.toString()}`);
}


// WebRTC server is used only for handling events via websockets
// return 404 for all requests
function handleWebRequest(request, response) {
  log ("Received request for " + request.url);
  response.writeHead(404);
  response.end();
}

// Start the server listening on port 6503
webServer.listen(6503, function() {
  log("WebSocket server is listening on port 6503");
});

// Create the WebSocket server by converting the HTTP server into one.
var wsServer = new WebSocketServer({
  httpServer: webServer,
  autoAcceptConnections: false
});

if (!wsServer) {
  log("ERROR: Unable to create WbeSocket server!");
}


// Set up a "connect" message handler on our WebSocket server. This is
// called whenever a user connects to the server's port using the
// WebSocket protocol.
wsServer.on('request', async function(request) {

  // Initialize data in redis client
  await initRedis();

  if (!originIsAllowed(request.origin)) {
    request.reject();
    log("Connection from " + request.origin + " rejected.");
    return;
  }

  // Accept the request and get a connection.
  var connection = request.accept("json", request.origin);

  // Add the new connection to our list of connections.
  log("Connection accepted from " + connection.remoteAddress + ".");
  let _connectionArray = await getConnectionArray();
  _connectionArray.push(connection);
  await setConnectionArray(_connectionArray);

  connection.clientID = nextID;
  nextID++;

  // Send the new client its token; it send back a "username" message to
  // tell us what username they want to use.

  var msg = {
    type: "id",
    id: connection.clientID
  };
  connection.sendUTF(JSON.stringify(msg));

  // Set up a handler for the "message" event received over WebSocket. This
  // is a message sent by a client, and may be text to share with other
  // users, a private message (text or signaling) for one user, or a command
  // to the server.

  connection.on('message', async function(message) {
    if (message.type === 'utf8') {
      log("Received Message: " + message.utf8Data);

      // Process incoming data.

      var sendToClients = true;
      msg = JSON.parse(message.utf8Data);
      var connect = await getConnectionForID(msg.id);

      // Take a look at the incoming object and act on it based
      // on its type. Unknown message types are passed through,
      // since they may be used to implement client-side features.
      // Messages with a "target" property are sent only to a user
      // by that name.

      switch(msg.type) {
        // Public, textual message
        case "message":
          msg.name = connect.username;
          msg.text = msg.text.replace(/(<([^>]+)>)/ig, "");
          break;

        // Username change
        case "username":
          var nameChanged = false;
          var origName = msg.name;

          // Ensure the name is unique by appending a number to it
          // if it's not; keep trying that until it works.
          var isUnique = await isUsernameUnique(msg.name);
          while (!isUnique) {
            msg.name = origName + appendToMakeUnique;
            appendToMakeUnique++;
            nameChanged = true;
            isUnique = await isUsernameUnique(msg.name);
          }

          // If the name had to be changed, we send a "rejectusername"
          // message back to the user so they know their name has been
          // altered by the server.
          if (nameChanged) {
            var changeMsg = {
              id: msg.id,
              type: "rejectusername",
              name: msg.name
            };
            connect.sendUTF(JSON.stringify(changeMsg));
          }

          // Set this connection's final username and send out the
          // updated user list to all users. Yeah, we're sending a full
          // list instead of just updating. It's horribly inefficient
          // but this is a demo. Don't do this in a real app.
          connect.username = msg.name;
          await sendUserListToAll();
          sendToClients = false;  // We already sent the proper responses
          break;
      }

      // Convert the revised message back to JSON and send it out
      // to the specified client or all clients, as appropriate. We
      // pass through any messages not specifically handled
      // in the select block above. This allows the clients to
      // exchange signaling and other control objects unimpeded.
      if (sendToClients) {
        var msgString = JSON.stringify(msg);
        var _connectionArray = await getConnectionArray();
        // If the message specifies a target username, only send the
        // message to them. Otherwise, send it to every user.
        if (msg.target && msg.target !== undefined && msg.target.length !== 0) {
          await sendToOneUser(msg.target, msgString);
        } else {
          for (var i=0; i<_connectionArray.length; i++) {
            _connectionArray[i].sendUTF(msgString);
          }
        }
      }
    }
  });

  // Handle the WebSocket "close" event; this means a user has logged off
  // or has been disconnected.
  connection.on('close', async function(reason, description) {
    // First, remove the connection from the list of connections.
    var _connectionArray = await getConnectionArray();
    _connectionArray = _connectionArray.filter(function(el, idx, ar) {
      return el.connected;
    });
    await setConnectionArray(_connectionArray);

    // Now send the updated user list. Again, please don't do this in a
    // real application. Your users won't like you very much.
    await sendUserListToAll();

    // Build and output log output for close information.
    var logMessage = "Connection closed: " + connection.remoteAddress + " (" +
                     reason;
    if (description !== null && description.length !== 0) {
      logMessage += ": " + description;
    }
    logMessage += ")";
    log(logMessage);
  });
});

// Export functions for testing
module.exports = {
  sendUserListToAll: sendUserListToAll,
  sendToOneUser: sendToOneUser,
  getConnectionForID: getConnectionForID,
  getConnectionArray: getConnectionArray,
  setConnectionArray: setConnectionArray,
  isUsernameUnique: isUsernameUnique,
  makeUserListMessage: makeUserListMessage,
  initRedis: initRedis,
  log: log
};