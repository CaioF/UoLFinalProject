//#!/usr/bin/env node
// Study Together server
"use strict";

const http = require('http');
const WebSocketServer = require('websocket').server;
const express = require('express');
import { get, set } from './redisService';

// Used for managing the text chat user list.
var connectionArray = [];
var nextID = Date.now();
var appendToMakeUnique = 1;

// Initialize vars in redis
async function initRedis() {
  await set('connectionArray', connectionArray);
}

// Get connectionsArray from redis
async function getConnectionArray() {
  const connectionArray = await get('connectionArray');
  return connectionArray;
}

// Set connectionsArray in redis
async function setConnectionArray(connectionArray) {
  await set('connectionArray', connectionArray);
}

initRedis;

// Output logging information to console
function log(text) {
  const time = new Date();
  console.log("[" + time.toLocaleTimeString() + "] " + text);
}

// Serve static files for get requests
const app = express();
app.use(express.static('public'));
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});
app.listen(8080, function() {
  log('Client app listening on port 8080!');
});

// CORS
function originIsAllowed(origin) {
  return true;    // Accept all connections for demonstration
}

// Scans the list of connections and return the one for the specified
function isUsernameUnique(name) {
  var isUnique = true;
  var _connectionArray = getConnectionArray();
  for (var i=0; i<_connectionArray.length; i++) {
    if (_connectionArray[i].username === name) {
      isUnique = false;
      break;
    }
  }
  return isUnique;
}

// Sends a message to one user. The message is a JSON string
function sendToOneUser(target, msgString) {
  var _connectionArray = getConnectionArray();
  for (var i=0; i<_connectionArray.length; i++) {
    if (_connectionArray[i].username === target) {
      _connectionArray[i].sendUTF(msgString);
      break;
    }
  }
}

// Scan the list of connections and return the one matching the clientID
function getConnectionForID(id) {
  var connect = null;
  var _connectionArray = getConnectionArray();
  for (var i=0; i<_connectionArray.length; i++) {
    if (_connectionArray[i].clientID === id) {
      connect = _connectionArray[i];
      break;
    }
  }
  return connect;
}

// Builds a message object of type "userlist" which contains all connected users
function makeUserListMessage() {
  var userListMsg = {
    type: "userlist",
    users: []
  };
  var _connectionArray = getConnectionArray();
  // Add the users to the list
  for (var i=0; i<_connectionArray.length; i++) {
    userListMsg.users.push(_connectionArray[i].username);
  }
  return userListMsg;
}

// Sends a "userlist" message to all chat members, for updating the user list
function sendUserListToAll() {
  var userListMsg = makeUserListMessage();
  var userListMsgStr = JSON.stringify(userListMsg);
  var _connectionArray = getConnectionArray();
  for (var i=0; i<_connectionArray.length; i++) {
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
wsServer.on('request', function(request) {
  if (!originIsAllowed(request.origin)) {
    request.reject();
    log("Connection from " + request.origin + " rejected.");
    return;
  }

  // Accept the request and get a connection.

  var connection = request.accept("json", request.origin);

  // Add the new connection to our list of connections.

  log("Connection accepted from " + connection.remoteAddress + ".");
  let _connectionArray = getConnectionArray()
  _connectionArray.push(connection);
  setConnectionArray(_connectionArray);

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

  connection.on('message', function(message) {
    if (message.type === 'utf8') {
      log("Received Message: " + message.utf8Data);

      // Process incoming data.

      var sendToClients = true;
      msg = JSON.parse(message.utf8Data);
      var connect = getConnectionForID(msg.id);

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
          while (!isUsernameUnique(msg.name)) {
            msg.name = origName + appendToMakeUnique;
            appendToMakeUnique++;
            nameChanged = true;
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
          sendUserListToAll();
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
        var _connectionArray = getConnectionArray();
        // If the message specifies a target username, only send the
        // message to them. Otherwise, send it to every user.
        if (msg.target && msg.target !== undefined && msg.target.length !== 0) {
          sendToOneUser(msg.target, msgString);
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
  connection.on('close', function(reason, description) {
    // First, remove the connection from the list of connections.
    var _connectionArray = getConnectionArray();
    _connectionArray = _connectionArray.filter(function(el, idx, ar) {
      return el.connected;
    });
    setConnectionArray(_connectionArray);

    // Now send the updated user list. Again, please don't do this in a
    // real application. Your users won't like you very much.
    sendUserListToAll();

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
