const socket = io();
socket.on('connect', () => {
  console.log('Connected to server with id:', socket.id);
});
socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

const chess = new Chess();
let board;
let playerColor;
let nickname;

// Elements
const home = document.getElementById('home');
const game = document.getElementById('game');
const nicknameInput = document.getElementById('nickname');
const createGameBtn = document.getElementById('createGame');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinGameBtn = document.getElementById('joinGame');
const errorMessage = document.getElementById('errorMessage');
const roomCodeDisplay = document.getElementById('roomCode');
const copyCodeBtn = document.getElementById('copyCode');
const gameStatus = document.getElementById('gameStatus');
const opponentName = document.getElementById('opponentName');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChat');
const backToHomeBtn = document.getElementById('backToHome');
const modeToggle = document.getElementById('modeToggle');

// Sound Effects
const moveSound = new Audio('https://freesound.org/data/previews/156/156331_2862862-lq.mp3');
const checkSound = new Audio('https://freesound.org/data/previews/171/171670_2435678-lq.mp3');

// Show/hide sections
function showHome() {
  home.style.display = 'block';
  game.style.display = 'none';
  errorMessage.textContent = '';
}

function showGame() {
  home.style.display = 'none';
  game.style.display = 'block';
}

// Create Game
createGameBtn.addEventListener('click', () => {
  console.log('Create Game button clicked');
  nickname = nicknameInput.value.trim();
  if (!nickname) {
    errorMessage.textContent = 'Please enter a nickname';
    return;
  }
  console.log('Emitting createRoom with nickname:', nickname);
  socket.emit('createRoom', { nickname });
});

socket.on('roomCreated', ({ roomCode, color, nickname: nick }) => {
  console.log('Received roomCreated:', roomCode, color, nick);
  showGame();
  roomCodeDisplay.textContent = roomCode;
  gameStatus.textContent = 'Waiting for opponent...';
  playerColor = color;
  nickname = nick;
});

// Join Game
joinGameBtn.addEventListener('click', () => {
  nickname = nicknameInput.value.trim();
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!nickname) {
    errorMessage.textContent = 'Please enter a nickname';
    return;
  }
  if (!roomCode) {
    errorMessage.textContent = 'Please enter a room code';
    return;
  }
  console.log('Emitting joinRoom with roomCode:', roomCode, 'nickname:', nickname);
  socket.emit('joinRoom', { roomCode, nickname });
});

socket.on('error', (msg) => {
  errorMessage.textContent = msg;
});

// Start Game
socket.on('startGame', ({ white, black, players }) => {
  console.log('Received startGame');
  showGame();
  const playerData = players[socket.id];
  playerColor = playerData.color;
  opponentName.textContent = playerData.opponent;
  gameStatus.textContent = `Game started! You are ${playerColor === 'w' ? 'White' : 'Black'}`;
  roomCodeDisplay.textContent = roomCodeInput.value.trim().toUpperCase() || roomCodeDisplay.textContent;
  initBoard();
});

// Initialize Chessboard
function initBoard() {
  console.log('Initializing board');
  const config = {
    draggable: true,
    position: 'start',
    orientation: playerColor === 'w' ? 'white' : 'black',
    onDragStart: (source, piece) => {
      if (chess.game_over() || chess.turn() !== playerColor[0] || piece.search(playerColor === 'w' ? /^b/ : /^w/) !== -1) {
        return false;
      }
    },
    onDrop: (source, target) => {
      const move = chess.move({ from: source, to: target, promotion: 'q' });
      if (move === null) return 'snapback';
      moveSound.play();
      if (chess.in_check()) checkSound.play();
      socket.emit('move', { roomCode: roomCodeDisplay.textContent, move: { from: source, to: target } });
      updateStatus();
    },
    onSnapEnd: () => board.position(chess.fen()),
  };
  board = Chessboard('board', config);
  updateStatus();
}

// Receive Moves
socket.on('move', (move) => {
  console.log('Received move:', move);
  chess.move({ from: move.from, to: move.to, promotion: 'q' });
  board.position(chess.fen());
  moveSound.play();
  if (chess.in_check()) checkSound.play();
  updateStatus();
});

// Update Game Status
function updateStatus() {
  if (chess.game_over()) {
    if (chess.in_checkmate()) {
      gameStatus.textContent = `Checkmate! ${chess.turn() === 'w' ? 'Black' : 'White'} wins!`;
    } else if (chess.in_stalemate()) {
      gameStatus.textContent = 'Stalemate!';
    } else {
      gameStatus.textContent = 'Game over!';
    }
    gameStatus.classList.remove('check');
  } else {
    if (chess.in_check()) {
      gameStatus.textContent = 'CHECK! Turn: ' + (chess.turn() === 'w' ? 'White' : 'Black');
      gameStatus.classList.add('check');
    } else {
      gameStatus.textContent = 'Turn: ' + (chess.turn() === 'w' ? 'White' : 'Black');
      gameStatus.classList.remove('check');
    }
  }
}

// Chat Functionality
sendChatBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChat();
});

function sendChat() {
  const message = chatInput.value.trim();
  if (!message) return;
  socket.emit('chatMessage', { roomCode: roomCodeDisplay.textContent, message });
  appendChatMessage(nickname, message, true);
  chatInput.value = '';
}

socket.on('chatMessage', ({ sender, message }) => {
  appendChatMessage(sender, message, false);
});

function appendChatMessage(sender, message, isSelf) {
  const div = document.createElement('div');
  div.className = `chat-message ${isSelf ? 'self' : 'opponent'}`;
  div.textContent = `${sender}: ${message}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Copy Room Code
copyCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomCodeDisplay.textContent);
  copyCodeBtn.textContent = 'Copied!';
  setTimeout(() => (copyCodeBtn.textContent = 'Copy'), 2000);
});

// Back to Home
backToHomeBtn.addEventListener('click', () => {
  board.destroy();
  showHome();
});

// Mode Toggle
modeToggle.addEventListener('change', () => {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', modeToggle.checked);
});

if (localStorage.getItem('darkMode') === 'true') {
  modeToggle.checked = true;
  document.body.classList.add('dark-mode');
}

// Handle Disconnection
socket.on('opponentDisconnected', () => {
  gameStatus.textContent = 'Opponent disconnected. Game over.';
});

// Initial State
showHome();