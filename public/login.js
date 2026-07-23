let currentUsername = '';

const loginForm = document.getElementById('loginForm');
const twoFactorZone = document.getElementById('twoFactorZone');
const setupZone = document.getElementById('setupZone');
const qrResult = document.getElementById('qrResult');
const message = document.getElementById('message');

function showMessage(text, isSuccess = false) {
  message.textContent = text;
  message.style.color = isSuccess ? 'lightgreen' : 'red';
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  currentUsername = username;

  const response = await fetch('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: username,
      password: password
    })
  });

  const data = await response.json();

  if (data.requires2FA) {
    showMessage(data.message, true);
    twoFactorZone.classList.remove('hidden');
    setupZone.classList.add('hidden');
    return;
  }

  if (data.setup2FA) {
    showMessage(data.message, false);
    setupZone.classList.remove('hidden');
    twoFactorZone.classList.add('hidden');
    return;
  }

  showMessage(data.error || 'Erreur de connexion.');
});

document.getElementById('generateQRButton').addEventListener('click', async () => {
  const password = document.getElementById('password').value;

  const response = await fetch('/setup-2fa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: currentUsername,
      password: password
    })
  });

  const data = await response.json();

  if (!response.ok) {
    showMessage(data.error || 'Erreur pendant la génération du QR Code.');
    return;
  }

  document.getElementById('qrCodeImage').src = data.qrCode;
  document.getElementById('secretText').textContent = data.secret;

  qrResult.classList.remove('hidden');
  showMessage('QR Code généré. Scanne-le puis saisis le premier code.', true);
});

document.getElementById('confirm2FAButton').addEventListener('click', async () => {
  const code = document.getElementById('confirmCode').value;

  const response = await fetch('/confirm-2fa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: currentUsername,
      code: code
    })
  });

  const data = await response.json();

  if (!response.ok) {
    showMessage(data.error || 'Code incorrect.');
    return;
  }

  showMessage(data.message + ' Reconnecte-toi maintenant.', true);

  setupZone.classList.add('hidden');
  twoFactorZone.classList.add('hidden');
  loginForm.reset();
});

document.getElementById('verify2FAButton').addEventListener('click', async () => {
  const code = document.getElementById('code2FA').value;

  const response = await fetch('/api/verify-2fa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: currentUsername,
      code: code
    })
  });

  const data = await response.json();

  if (!response.ok) {
    showMessage(data.error || 'Code 2FA invalide.');
    return;
  }

  window.location.href = '/bat-computer';
});