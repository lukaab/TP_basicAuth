const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('../config/db');

const router = express.Router();

router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'login.html'));
});

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Username et password obligatoires.');
  }

  const user = db.prepare(`
    SELECT * FROM users WHERE username = ?
  `).get(username.trim());

  if (!user) {
    return res.status(401).send('Identifiants invalides.');
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return res.status(401).send('Identifiants invalides.');
  }

  req.session.regenerate((err) => {
    if (err) {
      return next(err);
    }

    req.session.user = {
      id: user.id,
      username: user.username
    };

    req.session.save((err) => {
      if (err) {
        return next(err);
      }

      return res.redirect('/bat-computer');
    });
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('bat_identity');
    return res.redirect('/auth/login');
  });
});

router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Username et password obligatoires.');
  }

  const cleanUsername = username.trim();

  if (cleanUsername.length === 0 || /\s/.test(cleanUsername)) {
    return res.status(400).send("Le nom d'utilisateur ne doit pas contenir d'espaces.");
  }

  if (password.length < 8) {
    return res.status(400).send('Le mot de passe doit contenir au moins 8 caractères.');
  }

  const hash = await bcrypt.hash(password, 10);

  try {
    db.prepare(`
      INSERT INTO users (username, password)
      VALUES (?, ?)
    `).run(cleanUsername, hash);

    return res.status(201).send('Utilisateur créé avec succès.');
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).send("Ce nom d'utilisateur existe déjà.");
    }

    return res.status(500).send('Erreur serveur.');
  }
});

module.exports = router;