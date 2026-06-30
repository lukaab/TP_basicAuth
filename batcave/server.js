const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));


app.post('/register', async (req, res) => {
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


async function checkAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Batcave"');
    return res.status(401).send('Authentification requise.');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');

  const separatorIndex = credentials.indexOf(':');

  if (separatorIndex === -1) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Batcave"');
    return res.status(401).send('Format invalide.');
  }

  const username = credentials.slice(0, separatorIndex);
  const password = credentials.slice(separatorIndex + 1);

  const user = db.prepare(`
    SELECT * FROM users WHERE username = ?
  `).get(username);

  if (!user) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Batcave"');
    return res.status(401).send('Identifiants invalides.');
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Batcave"');
    return res.status(401).send('Identifiants invalides.');
  }

  req.user = {
    id: user.id,
    username: user.username
  };

  next();
}


app.get('/bat-computer', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'private', 'bat-computer.html'));
});

app.get('/api/secrets', checkAuth, (req, res) => {
  res.json([
    {
      name: 'Batarang',
      desc: 'Arme de jet en forme de chauve-souris',
      icon: 'fa-shuriken'
    },
    {
      name: 'Grapnel Gun',
      desc: 'Grappin permettant de se déplacer rapidement',
      icon: 'fa-arrow-up'
    },
    {
      name: 'Batmobile',
      desc: 'Véhicule blindé haute technologie',
      icon: 'fa-car'
    }
  ]);
});

app.get('/api/me', checkAuth, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username
  });
});

app.post('/api/reports', checkAuth, (req, res) => {
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).send('Le rapport ne peut pas être vide.');
  }

  db.prepare(`
    INSERT INTO reports (user_id, content)
    VALUES (?, ?)
  `).run(req.user.id, content.trim());

  return res.status(201).send('Rapport enregistré.');
});


app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});