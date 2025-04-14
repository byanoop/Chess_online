const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' folder
app.use(express.static('public'));

// Store active rooms: { roomCode: { player1: {socketId, nickname}, player2: {socketId, nickname}, gameStarted: false } }
const rooms = {};
const roomCodes = new Set();

// Generate a unique 4-digit alphanumeric room code
function generateRoomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
  } while (roomCodes.has(code));
  roomCodes.add(code);
  return code;
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Create a new room
  socket.on('createRoom', ({ nickname }) => {
    console.log('Received createRoom from:', nickname);
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      player1: { socketId: socket.id, nickname, color: 'w' },
      player2: null,
      gameStarted: false,
    };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, color: 'w', nickname });
    console.log('Emitted roomCreated with roomCode:', roomCode);
  });

  // Join an existing room
  socket.on('joinRoom', ({ roomCode, nickname }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('error', 'Room does not exist');
      return;
    }
    if (room.player2) {
      socket.emit('error', 'Room is full');
      return;
    }
    room.player2 = { socketId: socket.id, nickname, color: 'b' };
    room.gameStarted = true;
    socket.join(roomCode);

    // Notify both players to start the game
    io.to(roomCode).emit('startGame', {
      white: room.player1.nickname,
      black: room.player2.nickname,
      players: {
        [room.player1.socketId]: { color: 'w', opponent: room.player2.nickname },
        [room.player2.socketId]: { color: 'b', opponent: room.player1.nickname },
      },
    });
  });

  // Handle move events
  socket.on('move', ({ roomCode, move }) => {
    socket.to(roomCode).emit('move', move);
  });

  // Handle chat messages
  socket.on('chatMessage', ({ roomCode, message }) => {
    const room = rooms[roomCode];
    const sender = room.player1.socketId === socket.id ? room.player1.nickname : room.player2.nickname;
    io.to(roomCode).emit('chatMessage', { sender, message });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (room.player1?.socketId === socket.id) {
        if (room.player2) io.to(room.player2.socketId).emit('opponentDisconnected');
        delete rooms[roomCode];
        roomCodes.delete(roomCode);
      } else if (room.player2?.socketId === socket.id) {
        io.to(room.player1.socketId).emit('opponentDisconnected');
        delete rooms[roomCode];
        roomCodes.delete(roomCode);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));