const statusText = document.getElementById('status');
document.getElementById('login').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('submit'); button.disabled = true;
  const password = document.getElementById('password');
  try {
    const response = await fetch('https://novai-production-0d2f.up.railway.app/login-extension', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('email').value.trim(), password: password.value }),
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok || typeof data.token_user !== 'string') throw new Error();
    await chrome.storage.local.set({ token_user: data.token_user });
    statusText.textContent = 'Login concluído. Recarregue o anúncio.';
  } catch { statusText.textContent = 'Não foi possível entrar. Confira os dados e tente novamente.'; }
  finally { password.value = ''; button.disabled = false; }
});
document.getElementById('logout').addEventListener('click', async () => {
  await chrome.storage.local.remove('token_user'); statusText.textContent = 'Sessão removida deste dispositivo.';
});
