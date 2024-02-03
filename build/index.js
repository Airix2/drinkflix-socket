"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_1 = require("socket.io");
const questions_1 = require("./questions");
const io = new socket_io_1.Server({
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
    },
});
const bareState = {
    started: false,
    questionIndex: 0,
    currentMasterIndex: 0,
    masterAnswer: "",
};
let users = [
// { name: "Juan", userId: "1", socketId: "1", points: 0 },
// { name: "Alex2", userId: "2", socketId: "2", points: 0 },
// { name: "Miguel", userId: "3", socketId: "2", points: 0 },
];
let gameState = Object.assign(Object.assign({}, bareState), { playersAnswers: [] });
let questions = questions_1.questionsArray;
function addUser(userId, socketId, name) {
    const userFoundIndex = users.findIndex((user) => user.name === name);
    if (userFoundIndex === -1) {
        users.push({ userId, socketId, name, points: 0 });
    }
    else {
        users[userFoundIndex].socketId = socketId;
    }
}
function removeUser(socketId) {
    users = users.filter((user) => user.socketId !== socketId);
}
function getUserById(userId) {
    return users.find((user) => user.userId === userId);
}
const resetGame = () => {
    users = [];
    gameState = Object.assign(Object.assign({}, bareState), { playersAnswers: [] });
};
io.on("connection", (socket) => {
    socket.on("addUser", ({ userId, name }) => {
        if (users.some((user) => user.name === name)) {
            socket.emit("repeatedUser");
            return;
        }
        addUser(userId, socket.id, name);
        updateGameState();
    });
    socket.on("sendMessage", ({ senderId, receiverId, text }) => {
        const receiver = getUserById(receiverId);
        if (!(receiver === null || receiver === void 0 ? void 0 : receiver.socketId))
            return;
        io.to(receiver.socketId).emit("getMessage", {
            senderId,
            text,
        });
    });
    socket.on("startGame", () => {
        if (users.length < 1) {
            io.emit("noUsers");
            updateGameState();
            return;
        }
        const index = 0;
        gameState = Object.assign(Object.assign({}, bareState), { playersAnswers: [
            // { answer: "DC", name: "Juan", userId: "1" },
            // { answer: "Marvel", name: "Alex", userId: "2" },
            ], started: true, currentMasterIndex: index });
        updateGameState();
    });
    socket.on("submitAnswer", ({ userId, answer }) => {
        const userIndex = users.findIndex((user) => user.userId === userId);
        if (userIndex === gameState.currentMasterIndex) {
            gameState.masterAnswer = answer;
        }
        else {
            const hasSubmitted = gameState.playersAnswers.some((submission) => submission.userId === userId);
            if (!hasSubmitted) {
                gameState.playersAnswers.push({
                    userId,
                    answer,
                    name: users[userIndex].name,
                });
            }
        }
        if (gameState.playersAnswers.length === users.length - 1) {
            gameState.playersAnswers.forEach((submission) => {
                if (submission.answer === gameState.masterAnswer) {
                    const userIndex = users.findIndex((user) => user.userId === submission.userId);
                    if (userIndex !== -1) {
                        users[userIndex].points += 1;
                    }
                }
            });
        }
        updateGameState();
    });
    socket.on("getGameState", () => {
        updateGameState();
    });
    socket.on("disconnect", () => {
        removeUser(socket.id);
        if (users.length === 0) {
            gameState = Object.assign(Object.assign({}, bareState), { playersAnswers: [] });
        }
    });
    socket.on("nextQuestion", () => {
        nextQuestion();
    });
    socket.on("reset", () => {
        resetGame();
        updateGameState();
    });
    const updateGameState = () => {
        io.emit("updateGameState", Object.assign(Object.assign({}, gameState), { players: users, question: questions[gameState.questionIndex] }));
    };
    const nextQuestion = () => {
        gameState.questionIndex += 1;
        gameState.masterAnswer = "";
        gameState.playersAnswers = [];
        gameState.currentMasterIndex += 1;
        if (gameState.currentMasterIndex === users.length) {
            gameState.currentMasterIndex = 0;
        }
        if (gameState.questionIndex === questions.length) {
            gameState.questionIndex = 0;
        }
        io.emit("nextQuestion");
        updateGameState();
    };
});
io.listen(8080);
