// lib
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// app
const app = express();
const PORT = process.env.PORT || 8900;

// middleware
app.use(cors());

// create server
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://develop.d15j4islltbvt.amplifyapp.com/login",
      "*",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// save users
let users = [];

// add user
const statusUser = (userId, socketId) => {
  // check array, nếu có user đó --> true
  !users.some((user) => user.userId === userId) &&
    users.push({ userId, socketId });
};

// remove user
const removeUser = (socketId) => {
  users = users.filter((user) => user.socketId !== socketId);
};

io.on("connection", (socket) => {
  console.log("---> A user connected... " + `${socket.id}`);

  // status user
  socket.on("status_user", (userId) => {
    try {
      statusUser(userId, socket.id);

      io.emit("get_users", users);
    } catch (err) {
      console.log(err);
    }
  });

  // user join room (room: conversation id)
  socket.on("join_room", (room) => {
    try {
      // console.log("[ROM] - " + `${room}`);
      socket.join(room);

      // (get users when online)
      io.emit("get_users", users);
    } catch (err) {
      console.log(err);
    }
  });

  // user send message
  socket.on("send_message", ({ message }) => {
    try {
      console.log("MESSAGE - SOCKET - ", message);

      io.to(message.conversationID).emit("receiver_message", message);
    } catch (err) {
      console.log(err);
    }
  });

  // When user disconnected
  socket.on("disconnect", () => {
    try {
      console.log("---> A user disconnected.");
      removeUser(socket.id);

      // (get users when online)
      io.emit("get_users", users);
    } catch (err) {
      console.log(err);
    }
  });
});

server.listen(PORT, () => console.log(`Socket server running... ${PORT}!`));
