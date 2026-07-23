const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const db = require('../config/db');
const oauthProviders = require('../config/oauthProviders');

const router = express.Router();

const ACCESS_TOKEN_TIME = '15m';
const ACCESS_TOKEN_COOKIE_TIME = 15 * 60 * 1000;
const REFRESH_TOKEN_COOKIE_TIME = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production'
};

function base64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createRandomValue(size = 32) {
  return base64Url(crypto.randomBytes(size));
}

function createCodeVerifier() {
  return createRandomValue(64);
}

function createCodeChallenge(codeVerifier) {
  const hash = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest();

  return base64Url(hash);
}

function getRedirectUri(providerKey) {
  return `${process.env.APP_BASE_URL}/auth/${providerKey}/callback`;
}

function getProvider(providerKey) {
  const provider = oauthProviders[providerKey];

  if (!provider) {
    return null;
  }

  if (!provider.clientId || !provider.clientSecret) {
    return null;
  }

  return provider;
}

function createAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      provider: user.provider
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function redirectToError(res, message) {
  return res.redirect(`/auth/error?message=${encodeURIComponent(message)}`);
}

async function exchangeCodeForToken(providerKey, provider, code, codeVerifier) {
  const params = new URLSearchParams({
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code: code,
    redirect_uri: getRedirectUri(providerKey),
    grant_type: 'authorization_code',
    code_verifier: codeVerifier
  });

  let response;

  if (provider.tokenMethod === 'GET') {
    response = await fetch(`${provider.tokenUrl}?${params.toString()}`, {
      headers: {
        Accept: 'application/json'
      }
    });
  } else {
    response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
  }

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Erreur pendant l’échange du code.');
  }

  return data;
}

async function fetchGoogleProfile(provider, accessToken) {
  const response = await fetch(provider.userinfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const profile = await response.json();

  if (!response.ok) {
    throw new Error('Impossible de récupérer le profil Google.');
  }

  return {
    id: String(profile.sub),
    email: profile.email || null,
    displayName: profile.name || profile.email || 'Utilisateur Google'
  };
}

async function fetchGithubProfile(provider, accessToken) {
  const userResponse = await fetch(provider.userinfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Batcave-TP5'
    }
  });

  const githubUser = await userResponse.json();

  if (!userResponse.ok) {
    throw new Error('Impossible de récupérer le profil GitHub.');
  }

  let email = githubUser.email || null;

  if (!email) {
    const emailResponse = await fetch(provider.emailsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Batcave-TP5'
      }
    });

    const emails = await emailResponse.json();

    if (emailResponse.ok && Array.isArray(emails)) {
      const primaryEmail = emails.find((item) => item.primary && item.verified);
      const firstEmail = emails.find((item) => item.verified);

      email = primaryEmail?.email || firstEmail?.email || null;
    }
  }

  return {
    id: String(githubUser.id),
    email: email,
    displayName: githubUser.name || githubUser.login || 'Utilisateur GitHub'
  };
}

async function fetchFacebookProfile(provider, accessToken) {
  const url = new URL(provider.userinfoUrl);

  url.searchParams.set('fields', 'id,name,email');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url);
  const profile = await response.json();

  if (!response.ok) {
    throw new Error('Impossible de récupérer le profil Facebook.');
  }

  return {
    id: String(profile.id),
    email: profile.email || null,
    displayName: profile.name || 'Utilisateur Facebook'
  };
}

async function fetchProviderProfile(providerKey, provider, tokenData) {
  if (!tokenData.access_token) {
    throw new Error('Aucun access_token reçu du fournisseur.');
  }

  if (providerKey === 'google') {
    return fetchGoogleProfile(provider, tokenData.access_token);
  }

  if (providerKey === 'github') {
    return fetchGithubProfile(provider, tokenData.access_token);
  }

  if (providerKey === 'facebook') {
    return fetchFacebookProfile(provider, tokenData.access_token);
  }

  throw new Error('Fournisseur inconnu.');
}

function findOrCreateUser(providerKey, providerProfile) {
  const existingAccount = db.prepare(`
    SELECT oauth_accounts.*, users.id AS local_user_id
    FROM oauth_accounts
    JOIN users ON users.id = oauth_accounts.user_id
    WHERE oauth_accounts.provider = ?
    AND oauth_accounts.provider_user_id = ?
  `).get(providerKey, providerProfile.id);

  let userId;

  if (existingAccount) {
    userId = existingAccount.local_user_id;
  } else {
    const localUsername = `${providerKey}:${providerProfile.id}`;

    const result = db.prepare(`
      INSERT INTO users (username, password)
      VALUES (?, ?)
    `).run(localUsername, 'oauth-login');

    userId = result.lastInsertRowid;
  }

  db.prepare(`
    INSERT INTO oauth_accounts (
      user_id,
      provider,
      provider_user_id,
      email,
      display_name
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_user_id)
    DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    userId,
    providerKey,
    providerProfile.id,
    providerProfile.email,
    providerProfile.displayName
  );

  return {
    id: userId,
    username: providerProfile.displayName,
    provider: providerKey
  };
}

router.get('/', (req, res) => {
  res.redirect('/auth/login');
});

router.get('/auth/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'login.html'));
});

router.get('/auth/error', (req, res) => {
  const message = req.query.message || 'Erreur OAuth inconnue.';

  const filePath = path.join(__dirname, '..', 'views', 'oauth-error.html');
  const html = fs.readFileSync(filePath, 'utf-8');

  return res.send(html.replace('{{message}}', escapeHtml(message)));
});

router.get('/auth/:provider', (req, res) => {
  const providerKey = req.params.provider;
  const provider = getProvider(providerKey);

  if (!provider) {
    return redirectToError(res, 'Fournisseur OAuth inconnu ou mal configuré dans le fichier .env.');
  }

  const state = createRandomValue(32);
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);

  db.prepare(`
    INSERT INTO oauth_states (state, provider, code_verifier)
    VALUES (?, ?, ?)
  `).run(state, providerKey, codeVerifier);

  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: getRedirectUri(providerKey),
    response_type: 'code',
    scope: provider.scope,
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  for (const [key, value] of Object.entries(provider.extraAuthParams)) {
    params.set(key, value);
  }

  return res.redirect(`${provider.authorizeUrl}?${params.toString()}`);
});

router.get('/auth/:provider/callback', async (req, res) => {
  const providerKey = req.params.provider;
  const provider = getProvider(providerKey);

  if (!provider) {
    return redirectToError(res, 'Fournisseur OAuth inconnu ou mal configuré.');
  }

  if (req.query.error) {
    return redirectToError(
      res,
      `Connexion annulée ou refusée : ${req.query.error_description || req.query.error}`
    );
  }

  const { code, state } = req.query;

  if (!code || !state) {
    return redirectToError(res, 'Callback OAuth invalide : code ou state manquant.');
  }

  const storedState = db.prepare(`
    SELECT * FROM oauth_states
    WHERE state = ?
    AND provider = ?
  `).get(state, providerKey);

  if (!storedState) {
    return redirectToError(res, 'State OAuth invalide. La connexion est refusée.');
  }

  db.prepare(`
    DELETE FROM oauth_states
    WHERE state = ?
  `).run(state);

  try {
    const tokenData = await exchangeCodeForToken(
      providerKey,
      provider,
      code,
      storedState.code_verifier
    );

    const providerProfile = await fetchProviderProfile(providerKey, provider, tokenData);
    const user = findOrCreateUser(providerKey, providerProfile);

    createAuthCookies(res, user);

    return res.redirect('/bat-computer');
  } catch (error) {
    console.error('Erreur OAuth :', error);
    return redirectToError(res, error.message);
  }
});

router.post('/api/auth/refresh', (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).send('Refresh token manquant.');
  }

  const tokenInDb = db.prepare(`
    SELECT
      refresh_tokens.*,
      users.id AS local_user_id,
      COALESCE(oauth_accounts.display_name, users.username) AS display_name,
      oauth_accounts.provider AS provider
    FROM refresh_tokens
    JOIN users ON users.id = refresh_tokens.user_id
    LEFT JOIN oauth_accounts ON oauth_accounts.user_id = users.id
    WHERE refresh_tokens.token = ?
    LIMIT 1
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
    id: tokenInDb.local_user_id,
    username: tokenInDb.display_name,
    provider: tokenInDb.provider
  });

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_COOKIE_TIME
  });

  return res.status(200).send('Access token renouvelé.');
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

module.exports = router;