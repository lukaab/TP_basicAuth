const jwt = require('jsonwebtoken');
const db = require('../config/db');

function isAuthenticated(req, res, next) {
  const accessToken = req.cookies.accessToken;

  if (!accessToken) {
    return res.status(401).send('Access token manquant.');
  }

  try {
    const decodedUser = jwt.verify(accessToken, process.env.JWT_SECRET);

    req.user = {
      id: decodedUser.id,
      username: decodedUser.username,
      provider: decodedUser.provider
    };

    return next();
  } catch (err) {
    return res.status(401).send('Access token invalide ou expiré.');
  }
}

function canOpenDashboard(req, res, next) {
  const accessToken = req.cookies.accessToken;

  if (accessToken) {
    try {
      jwt.verify(accessToken, process.env.JWT_SECRET);
      return next();
    } catch (err) {
    }
  }

  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.redirect('/auth/login');
  }

  const tokenInDb = db.prepare(`
    SELECT * FROM refresh_tokens
    WHERE token = ?
  `).get(refreshToken);

  if (!tokenInDb) {
    return res.redirect('/auth/login');
  }

  if (new Date(tokenInDb.expires_at) < new Date()) {
    return res.redirect('/auth/login');
  }

  return next();
}

module.exports = {
  isAuthenticated,
  canOpenDashboard
};