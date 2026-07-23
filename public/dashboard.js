async function apiFetch(url, options = {}) {
  let response = await fetch(url, {
    ...options,
    credentials: 'same-origin'
  });

  if (response.status !== 401) {
    return response;
  }

  console.log('AccessToken expiré : tentative de rafraîchissement...');

  const refreshResponse = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin'
  });

  if (!refreshResponse.ok) {
    console.log('RefreshToken invalide ou expiré : redirection vers login.');
    window.location.href = '/auth/login';
    throw new Error('Utilisateur non authentifié.');
  }

  console.log('Refresh réussi : rejeu de la requête initiale.');

  response = await fetch(url, {
    ...options,
    credentials: 'same-origin'
  });

  return response;
}

function formatProvider(provider) {
  if (provider === 'google') {
    return 'Google';
  }

  if (provider === 'github') {
    return 'GitHub';
  }

  if (provider === 'facebook') {
    return 'Facebook';
  }

  return 'Fournisseur inconnu';
}

async function loadUser() {
  const response = await apiFetch('/api/me');
  const user = await response.json();

  document.getElementById('username').textContent = user.username;
  document.getElementById('provider').textContent = formatProvider(user.provider);
}

async function loadSecrets() {
  const response = await apiFetch('/api/secrets');
  const secrets = await response.json();

  const container = document.getElementById('secrets');
  container.textContent = '';

  secrets.forEach((secret) => {
    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('h3');
    title.textContent = secret.name;

    const description = document.createElement('p');
    description.textContent = secret.desc;

    const icon = document.createElement('small');
    icon.textContent = secret.icon;

    card.appendChild(title);
    card.appendChild(description);
    card.appendChild(icon);

    container.appendChild(card);
  });
}

async function sendReport() {
  const content = document.getElementById('reportContent').value;

  const response = await apiFetch('/api/reports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content: content })
  });

  const message = await response.text();

  document.getElementById('reportMessage').textContent = message;
}

document.getElementById('reloadSecrets').addEventListener('click', loadSecrets);
document.getElementById('sendReport').addEventListener('click', sendReport);

loadUser();
loadSecrets();