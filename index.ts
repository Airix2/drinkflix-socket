import { Server } from "socket.io";
import { questionsArray } from "./questions";
import express from "express";
import http from "http";
import { join } from "path";
import cors from "cors";

const app = express();
const server = http.createServer(app);

app.use(cors());
app.get("/", (req, res) => {
	app.use(express.static("public/"));
	res.sendFile(join(__dirname, "/public", "index.html"));
});
server.listen(3000, () => {
	console.log("server running at port 3000");
});
const io = new Server(server, {
	cors: {
		// origin: "https://drinkflix-xi.vercel.app",
		// origin: "http://localhost:8080",
		origin: "*",
	},
});
// const io = new Server({
// 	cors: {
// 		origin: "*",
// 		methods: ["GET", "POST"],
// 	},
// });

interface UserI {
	userId: string;
	socketId: string;
	name: string;
	points: number;
	disconnected?: boolean;
}
interface AnswerSubmissionI {
	userId: string;
	answer: string;
	name: string;
}
interface QuestionI {
	text: string;
	answers: string[];
}
interface GameStateI {
	started: boolean;
	questionIndex: number;
	currentMasterIndex: number;
	masterAnswer: string;
	playersAnswers: AnswerSubmissionI[];
}
const bareState = {
	started: false,
	questionIndex: 0,
	currentMasterIndex: 0,
	masterAnswer: "",
};

let users: UserI[] = [
	// { name: "Juan", userId: "1", socketId: "1", points: 0 },
	// { name: "Alex2", userId: "2", socketId: "2", points: 0 },
	// { name: "Miguel", userId: "3", socketId: "2", points: 0 },
];
let gameState: GameStateI = { ...bareState, playersAnswers: [] };
let questions: QuestionI[] = questionsArray;

const TIMEOUT_DURATION = 5000; // 1 minute in milliseconds
const disconnectTimeouts = new Map(); // To store timeout IDs for each socket

function addUser(userId: string, socketId: string, name: string) {
	const userFoundIndex = users.findIndex((user) => user.name === name);
	if (userFoundIndex === -1) {
		users.push({ userId, socketId, name, points: 0 });
	} else {
		users[userFoundIndex].socketId = socketId;
	}
}
function removeUser(name: string) {
	users = users.filter((user) => user.name !== name);
}
function getUserById(userId: string) {
	return users.find((user) => user.userId === userId);
}
function updateUser(user: UserI) {
	users = users.map((elem) => {
		if (elem.name === user.name) {
			return user;
		}
		return elem;
	});
}
const resetGame = () => {
	users = [];
	gameState = { ...bareState, playersAnswers: [] };
};

io.on("connection", (socket) => {
	socket.on("addUser", ({ userId, name }) => {
		const foundUser = users.find((user) => user.name === name);
		if (foundUser) {
			for (const [userName, timeoutId] of disconnectTimeouts.entries()) {
				const disconnectedUser = users.find((user) => user.name === userName);
				if (disconnectedUser && disconnectedUser.name === name) {
					userReconnected(disconnectedUser.name, socket.id);
					socket.emit("reconnected", disconnectedUser.userId);
					return;
				}
			}
			socket.emit("repeatedUser");
			return;
		}
		addUser(userId, socket.id, name);
		updateGameState();
	});

	socket.on("sendMessage", ({ senderId, receiverId, text }) => {
		const receiver = getUserById(receiverId);
		if (!receiver?.socketId) return;
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
		gameState = {
			...bareState,
			playersAnswers: [
				// { answer: "DC", name: "Juan", userId: "1" },
				// { answer: "Marvel", name: "Alex", userId: "2" },
			],
			started: true,
			currentMasterIndex: index,
			// masterAnswer: "DC",
		};

		updateGameState();
	});

	socket.on(
		"submitAnswer",
		({ userId, answer }: { userId: string; answer: string }) => {
			const userIndex = users.findIndex((user) => user.userId === userId);
			if (userIndex === gameState.currentMasterIndex) {
				gameState.masterAnswer = answer;
			} else {
				const hasSubmitted = gameState.playersAnswers.some(
					(submission) => submission.userId === userId
				);
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
						const userIndex = users.findIndex(
							(user) => user.userId === submission.userId
						);
						if (userIndex !== -1) {
							users[userIndex].points += 1;
						}
					}
				});
			}
			updateGameState();
		}
	);

	socket.on("getGameState", () => {
		updateGameState();
	});

	socket.on("disconnect", () => {
		const disconnectedUser = users.find((user) => user.socketId === socket.id);
		if (!disconnectedUser) return;
		disconnectedUser.disconnected = true;
		updateUser(disconnectedUser);
		updateGameState();

		const timeoutId = setTimeout(() => {
			userDisconnected(socket.id);
		}, TIMEOUT_DURATION);
		disconnectTimeouts.set(disconnectedUser.name, timeoutId);
	});
	socket.on("nextQuestion", () => {
		if (gameState.playersAnswers.length !== 0) {
			nextQuestion();
		}
	});
	socket.on("reset", () => {
		resetGame();
		updateGameState();
	});

	const userReconnected = (name: string, newSocket: string) => {
		const disconnectedUser = users.find((user) => user.name === name);
		if (!disconnectedUser) return;
		disconnectedUser.disconnected = false;
		disconnectedUser.socketId = newSocket;
		updateUser(disconnectedUser);
		updateGameState();

		//clean up timeout
		const timeoutId = disconnectTimeouts.get(disconnectedUser.name);
		if (timeoutId) {
			clearTimeout(timeoutId); // Cancel the timeout
			disconnectTimeouts.delete(disconnectedUser.name); // Clean up
		}
	};
	const userDisconnected = (socketId: string) => {
		const removedUser = users.find((elem) => elem.socketId === socketId);
		const name = removedUser?.name;
		if (!name) return;
		removeUser(name);
		disconnectTimeouts.delete(name); // Clean up after timeout runs
		if (users[gameState.currentMasterIndex]?.name === name) {
			nextQuestion();
		} else {
			gameState.playersAnswers = gameState.playersAnswers.filter(
				(ans) => ans.name !== name
			);
		}
		if (users.length === 0) {
			gameState = { ...bareState, playersAnswers: [] };
		}
		updateGameState();
	};

	const updateGameState = () => {
		io.emit("updateGameState", {
			...gameState,
			players: users,
			question: questions[gameState.questionIndex],
		});
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
