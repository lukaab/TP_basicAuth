require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const authRouter = require('./routes/auth');
const batcomputerRouter = require('./routes/batcomputer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', authRouter);
app.use('/', batcomputerRouter);

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});