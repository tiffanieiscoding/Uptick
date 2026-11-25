import { Game } from './game.js';

const res = await fetch('data/questions.json');
const questions = await res.json();
new Game(questions);