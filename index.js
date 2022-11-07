// lib
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");

// app
const app = express();
const PORT = process.env.PORT || 8900;

// config .env
dotenv.config();

// middleware
app.use(cors());

// create server
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      process.env.SOCKET_SERVER_BASE_URL,
      process.env.SOCKET_SERVER_BASE_URL_DEV,
      process.env.SOCKET_SERVER_BASE_URL_ANY,
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log(process.env.SOCKET_SERVER_BASE_URL);
console.log(process.env.SOCKET_SERVER_BASE_URL_DEV);
console.log(process.env.SOCKET_SERVER_BASE_URL_ANY);

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

const findUserById = (id) => {
  return users.find((user) => user.userId === id);
};

io.on("connection", (socket) => {
  console.log("---> A user connected... " + `${socket.id}`);

  // status user
  socket.on("status_user", (userId) => {
    console.log(userId);
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

  //recall message
  socket.on("recall_message", ({ message }) => {
    try {
      console.log(message);
      io.emit("receiver_recall_message", message);
    } catch (error) {
      console.log(`[recall message] -> ${error}`);
    }
  });

  //send friend request
  socket.on("send_friend_request", ({ request }) => {
    try {
      console.log(request);
      const { receiverId } = request;
      const _user = findUserById(receiverId);
      //check user online
      if (_user) {
        console.log("destination", _user);
        io.to(_user.socketId).emit("receiver_friend_request", request);
      } else {
        console.warn("user offline");
      }
    } catch (error) {
      console.log(`[send_friend_request] -> ${error}`);
    }
  });

  //accept friend request
  socket.on(
    "accept_friend_request",
    ({
      listFriendsReceiver,
      listFriendsSender,
      sender,
      receiver,
      conversation,
    }) => {
      try {
        const _receiver = findUserById(receiver.id);
        const _sender = findUserById(sender.id);
        console.log(_receiver, _sender);
        //no run with receiver
        if (_receiver) {
          const _conversation = {
            ...conversation,
            name: sender.name,
            imageLinkOfConver: sender.avatar,
          };
          io.to(_receiver.socketId).emit(
            "receive_friends",
            listFriendsReceiver
          );
          io.to(_receiver.socketId).emit(
            "receive_friends_give_conversation",
            _conversation
          );
        }

        if (_sender) {
          const _conversation = {
            ...conversation,
            name: receiver.name,
            imageLinkOfConver: receiver.avatar,
          };
          io.to(_sender.socketId).emit("send_friends", listFriendsSender);
          io.to(_sender.socketId).emit(
            "send_friends_give_conversation",
            _conversation
          );
        }
      } catch (err) {
        console.warn(`[accept_friend_request] -> ${err}`);
      }
    }
  );

  //create group
  socket.on("create_group", ({ conversation }) => {
    //console.log(conversation.members);
    //get users in conversation group online
    try {
      conversation.members.forEach((member) => {
        const user = findUserById(member);
        //console.log("----->", user);
        //send message to user doing online
        if (user) {
          io.to(user.socketId).emit("send_conversation_group", conversation);
        }
      });
    } catch (err) {
      console.warn(`[create_group] -> ${err}`);
    }
  });

  // When user disconnected
  socket.on("disconnect", () => {
    try {
      console.log("---> A user disconnected.", socket.id);
      removeUser(socket.id);

      // (get users when online)
      io.emit("get_users", users);
    } catch (err) {
      console.log(err);
    }
  });
});

server.listen(PORT, () => console.log(`Socket server running... ${PORT}!`));
