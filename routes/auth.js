const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const qrcode = require('qrcode');
const { authenticator } = require('@otplib/preset-v11');

const db = require('../config/db');
const { isAuthenticated } = require('../middlewares/authCheck');

const router = express.Router();

const ACCESS_TOKEN_TIME = '15m';
const ACCESS_TOKEN_COOKIE_TIME = 15 * 60 * 1000;
const REFRESH_TOKEN_COOKIE_TIME = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production'
};

function createAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username
    },
    process.env.JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_TIME
    }
  );
}

function createRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function createAuthCookies(res, user) {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken();

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_COOKIE_TIME).toISOString();

  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(user.id, refreshToken, expiresAt);

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_COOKIE_TIME
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_COOKIE_TIME
  });
}

router.get('/', (req, res) => {
  res.redirect('/auth/login');
});

router.get('/auth/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'login.html'));
});

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: 'Username et password obligatoires.'
    });
  }

  const user = db.prepare(`
    SELECT * FROM users
    WHERE username = ?
  `).get(username.trim());

  if (!user) {
    return res.status(401).json({
      error: 'Identifiants invalides.'
    });
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return res.status(401).json({
      error: 'Identifiants invalides.'
    });
  }

  if (user.two_factor_enabled === 0 || !user.two_factor_secret) {
    return res.status(403).json({
      setup2FA: true,
      message: 'Mot de passe correct. Vous devez maintenant activer la double authentification.',
      username: user.username
    });
  }

  return res.json({
    requires2FA: true,
    message: 'Étape 1 validée. Veuillez fournir votre code TOTP.',
    username: user.username
  });
});

router.post('/setup-2fa', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: 'Username et password obligatoires.'
    });
  }

  const user = db.prepare(`
    SELECT * FROM users
    WHERE username = ?
  `).get(username.trim());

  if (!user) {
    return res.status(401).json({
      error: 'Identifiants invalides.'
    });
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return res.status(401).json({
      error: 'Identifiants invalides.'
    });
  }

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.username, 'Batcave', secret);
  const qrCode = await qrcode.toDataURL(otpauth);

  db.prepare(`
    UPDATE users
    SET two_factor_secret = ?, two_factor_enabled = 0
    WHERE id = ?
  `).run(secret, user.id);

  return res.json({
    qrCode: qrCode,
    secret: secret
  });
});

router.post('/confirm-2fa', (req, res) => {
  const { username, code } = req.body;

  if (!username || !code) {
    return res.status(400).json({
      error: 'Username et code obligatoires.'
    });
  }

  const user = db.prepare(`
    SELECT * FROM users
    WHERE username = ?
  `).get(username.trim());

  if (!user || !user.two_factor_secret) {
    return res.status(404).json({
      error: 'Utilisateur ou secret 2FA introuvable.'
    });
  }

  const isValid = authenticator.check(code, user.two_factor_secret);

  if (!isValid) {
    return res.status(401).json({
      error: 'Code incorrect. Activation avortée.'
    });
  }

  db.prepare(`
    UPDATE users
    SET two_factor_enabled = 1
    WHERE id = ?
  `).run(user.id);

  return res.json({
    success: true,
    message: 'La 2FA est désormais activée sur votre compte.'
  });
});

router.post('/api/verify-2fa', (req, res) => {
  const { username, code } = req.body;

  if (!username || !code) {
    return res.status(400).json({
      error: 'Username et code obligatoires.'
    });
  }

  const user = db.prepare(`
    SELECT * FROM users
    WHERE username = ?
  `).get(username.trim());

  if (!user || !user.two_factor_secret || user.two_factor_enabled !== 1) {
    return res.status(401).json({
      error: '2FA non activée pour cet utilisateur.'
    });
  }

  const isValid = authenticator.check(code, user.two_factor_secret);

  if (!isValid) {
    return res.status(401).json({
      error: 'Code 2FA invalide ou expiré.'
    });
  }

  createAuthCookies(res, user);

  return res.json({
    success: true,
    message: 'Authentification double facteur réussie.'
  });
});

router.get('/auth/logout', (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken) {
    db.prepare(`
      DELETE FROM refresh_tokens
      WHERE token = ?
    `).run(refreshToken);
  }

  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);

  return res.redirect('/auth/login');
});

router.post('/auth/register', async (req, res) => {
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

router.post('/api/auth/refresh', (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).send('Refresh token manquant.');
  }

  const tokenInDb = db.prepare(`
    SELECT refresh_tokens.*, users.username
    FROM refresh_tokens
    JOIN users ON users.id = refresh_tokens.user_id
    WHERE refresh_tokens.token = ?
  `).get(refreshToken);

  if (!tokenInDb) {
    return res.status(401).send('Refresh token invalide.');
  }

  if (new Date(tokenInDb.expires_at) < new Date()) {
    db.prepare(`
      DELETE FROM refresh_tokens
      WHERE token = ?
    `).run(refreshToken);

    return res.status(401).send('Refresh token expiré.');
  }

  const accessToken = createAccessToken({
    id: tokenInDb.user_id,
    username: tokenInDb.username
  });

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_COOKIE_TIME
  });

  return res.status(200).send('Access token renouvelé.');
});

router.post('/api/auth/change-password', isAuthenticated, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).send('Ancien et nouveau mot de passe obligatoires.');
  }

  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

  if (!strongPasswordRegex.test(newPassword)) {
    return res.status(400).send(
      'Le nouveau mot de passe doit contenir au moins 12 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.'
    );
  }

  const user = db.prepare(`
    SELECT * FROM users
    WHERE id = ?
  `).get(req.user.id);

  if (!user) {
    return res.status(404).send('Utilisateur introuvable.');
  }

  const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);

  if (!isOldPasswordValid) {
    return res.status(401).send('Ancien mot de passe incorrect.');
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  db.prepare(`
    UPDATE users
    SET password = ?
    WHERE id = ?
  `).run(newHash, req.user.id);

  return res.status(200).send('Mot de passe modifié avec succès.');
});

module.exports = router;