require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const authRouter = require('./routes/auth');
const batcomputerRouter = require('./routes/batcomputer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  name: 'bat_identity',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 1800000
  }
}));

app.get('/', (req, res) => {
  res.redirect('/auth/login');
});

app.use('/auth', authRouter);
app.use('/', batcomputerRouter);

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});