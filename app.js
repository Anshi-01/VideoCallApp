const path = require("path");
const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const socketIo = require('socket.io');
const io = socketIo(server);
const { v4: uuidv4 } = require('uuid');

app.set("view engine","ejs");
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")))   
app.use(express.static('public', {
  setHeaders: (res, path) => {
      if (path.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript');
      }
  }
}));

app.get("/",function(req,res){
      res.render("index")
})

const usernames = [];
const userids = [];
const waitingUsers = []
const userRooms = new Map();

function cleanupRoom(socket) {
    const room = userRooms.get(socket.id);
    if (room) {
        socket.to(room).emit("userDisconnected");
        userRooms.delete(socket.id);
    }
}

io.on("connection",function(socket){
   console.log("user connected")

   socket.on("join",function(){
    if(waitingUsers.length>0){
      const room =uuidv4();
      socket.join(room);   //new user jo aya h uske room mei join krdo
      waitingUsers[0].join(room);    //waiting user ko bhi join kra do room mei
      userRooms.set(socket.id, room);
      userRooms.set(waitingUsers[0].id, room);
      waitingUsers.pop()   //waitinguser array is empty for next
      io.to(room).emit("roomname")
    }
    else{
      waitingUsers.push(socket);
    }
   })

   socket.on("username",function(username){ //username is received 
    usernames.push(username);
    userids.push(socket.id); //id is pushed of the current user
    
    const room = userRooms.get(socket.id);
    io.to(room).emit("users",usernames); //shows to all

    if(usernames<=2){
      usernames.pop()
 
    }

   
   })

    socket.on("message",function(message){
        let index = userids.indexOf(socket.id);
        if(message.length>0){
            const room = userRooms.get(socket.id);
            io.to(room).emit("message", {  // Send message only to users in the same room
                message, 
                name: usernames[index], 
                id: socket.id
            });
        }
    })

    socket.on("typing", function() {
        let index = userids.indexOf(socket.id);
        const room = userRooms.get(socket.id);

        io.to(room).emit("typing", usernames[index]);
    });
    

    socket.on("disconnect", function(){
        console.log("user disconnected")
        let index = userids.indexOf(socket.id);
        userids.splice(index,1); //remove the current id from the array of ids
        usernames.splice(index, 1); // remove the username from the array of usernames
        
        cleanupRoom(socket);
        
        const room = userRooms.get(socket.id);
        io.to(room).emit("users",usernames); //shows to all

       })

    socket.on("videoOffer", function(data) {
        const room = userRooms.get(socket.id);
        socket.to(room).emit("videoOffer", data);
    });

    socket.on("videoAnswer", function(data) {
        const room = userRooms.get(socket.id);
        socket.to(room).emit("videoAnswer", data);
    });

    socket.on("iceCandidate", function(data) {
        const room = userRooms.get(socket.id);
        socket.to(room).emit("iceCandidate", data);
    });

    socket.on("endCall", function() {
        const room = userRooms.get(socket.id);
        io.to(room).emit("callEnded");
    });

    socket.on("initiateCall", function(data) {
        const room = userRooms.get(socket.id);
        socket.to(room).emit("incomingCall", data);
    });

    socket.on("callAccepted", function() {
        const room = userRooms.get(socket.id);
        socket.to(room).emit("callAccepted");
    });

    socket.on("callRejected", function() {
        const room = userRooms.get(socket.id);
        socket.to(room).emit("callRejected");
    });

    socket.on('connect', () => {
        console.log('Socket connected, setting up WebRTC');
        setupEventListeners(); // Set up listeners again after connection
    });

    socket.on("userExit", function() {
        // Remove user from arrays
        let index = userids.indexOf(socket.id);
        if (index > -1) {
            userids.splice(index, 1);
            usernames.splice(index, 1);
        }
        
        // Remove from waiting users
        let waitingIndex = waitingUsers.indexOf(socket);
        if (waitingIndex > -1) {
            waitingUsers.splice(waitingIndex, 1);
        }
        
        // Get room before cleanup
        const room = userRooms.get(socket.id);
        
        // Notify other user and cleanup
        if (room) {
            socket.to(room).emit("userDisconnected");
            io.to(room).emit("users", usernames);
            socket.leave(room);
            userRooms.delete(socket.id);
        }
        
        // Force disconnect the socket
        socket.disconnect(true);
    });

    // Add this to handle reconnections
    socket.on("connect", () => {
        console.log('Socket reconnected');
    });
   })

 
    


server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
    console.log('Access on other devices using:');
    console.log('http://192.168.1.4:3000');
});