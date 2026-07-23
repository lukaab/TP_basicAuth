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

async function loadUser() {
  const response = await apiFetch('/api/me');
  const user = await response.json();

  document.getElementById('username').textContent = user.username;
}

async function loadSecrets() {
  const response = await apiFetch('/api/secrets');
  const secrets = await response.json();

  const container = document.getElementById('secrets');
  container.innerHTML = '';

  secrets.forEach((secret) => {
    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <h3>${secret.name}</h3>
      <p>${secret.desc}</p>
      <small>${secret.icon}</small>
    `;

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

async function changePassword(event) {
  event.preventDefault();

  const oldPassword = document.getElementById('oldPassword').value;
  const newPassword = document.getElementById('newPassword').value;

  const response = await apiFetch('/api/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      oldPassword: oldPassword,
      newPassword: newPassword
    })
  });

  const message = await response.text();

  document.getElementById('passwordMessage').textContent = message;

  if (response.ok) {
    document.getElementById('changePasswordForm').reset();
  }
}

document.getElementById('reloadSecrets').addEventListener('click', loadSecrets);
document.getElementById('sendReport').addEventListener('click', sendReport);
document.getElementById('changePasswordForm').addEventListener('submit', changePassword);

loadUser();
loadSecrets();