server = require("./server.js");

// Tests
async function testIsUsernameUnique() {
    const username1 = "john_doe";
    const username2 = "jane_doe";

    // Test for a unique username
    let isUnique = await server.isUsernameUnique(username1);
    if (!isUnique) {
        console.error(`Error: ${username1} should be a unique username, but it's not`);
        return false;
    }

    await server.setConnectionArray([{username: username2}]);
    // Test for a non-unique username
    isUnique = await server.isUsernameUnique(username2);
    if (isUnique) {
        console.error(`Error: ${username2} should not be a unique username, but it is`);
        return false;
    }

    console.log("isUsernameUnique tests passed");
    return true;
}
  
async function testSendToOneUser() {
    const target1 = "john_doe";
    const target2 = "jane_doe";
    const message1 = JSON.stringify({type: "message", text: "Hello, John!"});
    const message2 = JSON.stringify({type: "message", text: "Hello, Jane!"});
    
    // Test sending a message to an existing user
    let connectionArray = await server.getConnectionArray();
    let initialLength = connectionArray.length;
    await server.sendToOneUser(target1, message1);
    connectionArray = await server.getConnectionArray();
    let finalLength = connectionArray.length;
    if (initialLength !== finalLength) {
      console.error(`Error: The length of the connection array changed after sending a message to ${target1}`);
      return false;
    }
    
    // Test sending a message to a non-existing user
    initialLength = connectionArray.length;
    await server.sendToOneUser(target2, message2);
    connectionArray = await server.getConnectionArray();
    finalLength = connectionArray.length;
    if (initialLength !== finalLength) {
      console.error(`Error: The length of the connection array changed after sending a message to ${target2}`);
      return false;
    }
    
    console.log("sendToOneUser tests passed");
    return true;
}
  
async function testGetConnectionForID() {
    const id1 = "123456";
    const id2 = "789012";

    // Test for an existing connection
    let connectionArray = await server.getConnectionArray();
    let connection1 = connectionArray[0];
    connection1.clientID = id1;
    let connectionForID1 = await server.getConnectionForID(id1);
    if (connectionForID1 !== connection1) {
        console.error(`Error: The getConnectionForID function returned a different connection for ID ${id1}`);
        return false;
    }

    // Test for a non-existing connection
    let connectionForID2 = await server.getConnectionForID(id2);
    if (connectionForID2 !== null) {
        console.error(`Error: The getConnectionForID function should return null for ID ${id2}`);
        return false;
    }

    console.log("getConnectionForID tests passed");
    return true;
}

async function testMakeUserListMessage() {
    // Test with an empty connection array
    let connectionArray = [];
    server.setConnectionArray(connectionArray);
    let userListMsg = await server.makeUserListMessage();
    if (userListMsg.type !== "userlist") {
      console.error(`Error: The makeUserListMessage function returned an incorrect user list message for an empty connection array`);
      return false;
    }
    
    // Test with a non-empty connection array
    connectionArray = [
      {username: "john_doe", clientID: "123456"},
      {username: "jane_doe", clientID: "789012"},
      {username: "jim_smith", clientID: "345678"}
    ];
    server.setConnectionArray(connectionArray);
    userListMsg = await server.makeUserListMessage();
    if (userListMsg.type !== "userlist") {
      console.error(`Error: The makeUserListMessage function returned an incorrect user list message for a non-empty connection array`);
      return false;
    }
    
    console.log("makeUserListMessage tests passed");
    return true;
}

async function main() {
    let testsPassed = true;
    testsPassed = testsPassed && await testIsUsernameUnique();
    testsPassed = testsPassed && await testSendToOneUser();
    testsPassed = testsPassed && await testGetConnectionForID();
    testsPassed = testsPassed && await testMakeUserListMessage();
    if (testsPassed) {
        console.log("All tests passed");
    }
    process.exit();
}

main();