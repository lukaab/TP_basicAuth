const form = document.getElementById('registerForm');
const message = document.getElementById('message');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const response = await fetch('/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: username,
      password: password
    })
  });

  const text = await response.text();

  message.textContent = text;

  if (response.ok) {
    message.style.color = 'lightgreen';
    form.reset();
  } else {
    message.style.color = 'red';
  }
});