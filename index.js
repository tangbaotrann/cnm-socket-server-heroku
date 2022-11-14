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
    //console.log(message);
    try {
      const { conversationID, contentMessage, content, createAt } = message;
      const conversation = {
        conversationID,
        content,
        contentMessage,
        createAt,
      };
      message.members.forEach((member) => {
        const user = findUserById(member);
        console.log("member -> ", user);
        if (user)
          io.to(user.socketId).emit("update_last_message", conversation);
      });

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
        if (!(member === conversation.createdBy)) {
          const user = findUserById(member);
          console.log("----->", user);
          //send message to user doing online
          if (user) {
            io.to(user.socketId).emit("send_conversation_group", conversation);
          }
        }
      });
    } catch (err) {
      console.warn(`[create_group] -> ${err}`);
    }
  });

  //support update lastMessage
  const updateConversationBySocket = (members, conversation) => {
    members.forEach((member) => {
      const user = findUserById(member);
      if (user) io.to(user.socketId).emit("update_last_message", conversation);
    });
  };

  //add user to group
  socket.on("add_user_to_group", ({ info }) => {
    try {
      //get conversation and more prop
      //add conversation to new member and update lastMessage to users online in group
      const {
        id,
        name,
        members,
        imageLink,
        lastMessage,
        time,
        isGroup,
        createBy,
        isCalling,
        deleteBy,
        blockBy,
        newMember,
      } = info;
      const conversation = {
        id,
        name,
        members,
        imageLinkOfConver: imageLink,
        lastMessage,
        time,
        isGroup,
        createBy,
        isCalling,
        deleteBy,
        blockBy,
      };
      console.log(`[add_user_to_group] -->`, info);
      newMember.forEach((member) => {
        const user = findUserById(member);
        if (user)
          io.to(user.socketId).emit("send_conversation_group", conversation);
      });

      const newMemberLength = newMember.length;
      //remove new members to send emit updateLastMessage
      members.splice(-newMemberLength, newMemberLength);
      const conversationUpdate = {
        conversationID: id,
        contentMessage: lastMessage,
        members,
        createAt: time,
      };
      updateConversationBySocket(members, conversationUpdate);
    } catch (error) {
      console.warn(`[add_user_to_group] -> ${error}`);
    }
  });

  //change name group
  socket.on("change_name_group", ({ conversation }) => {
    try {
      //get conversation have action to update lastMessage
      const { id, name, action, time, members } = conversation;
      const _conversation = {
        conversationID: id,
        name,
        contentMessage: action,
        createAt: time,
      };
      updateConversationBySocket(members, _conversation);
    } catch (error) {
      console.warn(`[change_name_group] -> ${error}`);
    }
  });

  //change avatar group
  socket.on("change_avatar_group", ({ conversation }) => {
    try {
      const { id, imageLink, action, time, members } = conversation;
      const _conversation = {
        conversationID: id,
        imageLink,
        contentMessage: action,
        createAt: time,
      };
      updateConversationBySocket(members, _conversation);
    } catch (error) {
      console.warn(`[change_avatar_group] -> ${error}`);
    }
  });

  //block user in group
  socket.on("block_user_in_group", ({ info }) => {
    try {
      const { _id, idMember, action, time, members } = info;
      const userBlocked = findUserById(idMember);
      const idConversationBlocked = _id;
      const conversationUpdate = {
        conversationID: _id,
        contentMessage: action,
        createAt: time,
        members,
      };
      console.log(userBlocked);
      if (userBlocked)
        io.to(userBlocked.socketId).emit(
          "remove_conversation_block_group",
          idConversationBlocked
        );
      updateConversationBySocket(members, conversationUpdate);
      // members.forEach((member) => {
      //   const user = findUserById(member);
      //   if (user)
      //     io.to(user.socketId).emit("update_last_message", conversationUpdate);
      // });
    } catch (error) {
      console.warn(`[block_user_in_group] -> ${error}`);
    }
  });

  //remove group
  socket.on("remove_group", ({ info }) => {
    try {
      //console.log(info);
      const { _id, members } = info;
      members.forEach((member) => {
        const user = findUserById(member);
        if (user) {
          io.to(user.socketId).emit("remove_conversation_block_group", _id);
        }
      });
    } catch (error) {
      console.warn(`[remove_group] -> ${error}`);
    }
  });

  //out group
  socket.on("user_out_group", ({ info }) => {
    try {
      const { _id, idMember, action, time, members } = info;
      const leftUser = findUserById(idMember);
      const conversationUpdate = {
        conversationID: _id,
        contentMessage: action,
        createAt: time,
      };
      if (leftUser)
        io.to(leftUser.socketId).emit("remove_conversation_block_group", _id);
      members.forEach((member) => {
        const user = findUserById(member);
        if (user)
          io.to(user.socketId).emit("update_last_message", conversationUpdate);
      });
    } catch (err) {
      console.warn(`[user_out_group] --> ${err}`);
    }
  });

  // block message user
  socket.on("block_message_user_in_group", ({ info }) => {
    try {
      const { blockBy, id, userId } = info;
      const blockByUserId = findUserById(userId);
      console.log("[blockByUserId] - ", blockByUserId);
      const conversationId = id;
      console.log("[conversationId] - ", conversationId);
      const arrBlocked = {
        blockBy,
        conversationId,
      };

      if (blockByUserId) {
        io.to(blockByUserId.socketId).emit("blocked_message_user", arrBlocked);
      }
    } catch (error) {
      console.warn(`[block_message_user_in_group] -> ${error}`);
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
