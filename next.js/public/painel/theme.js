(() => {
  const storageKey = 'novai-theme';
  let theme = 'dark';
  try {
    if (localStorage.getItem(storageKey) === 'light') theme = 'light';
  } catch {}

  function updateControls() {
    for (const button of document.querySelectorAll('[data-toggle-theme]')) {
      if (!button.querySelector('.theme-option')) {
        button.innerHTML = '<span class="theme-option theme-sun" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg></span><span class="theme-option theme-moon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/></svg></span>';
      }
      button.removeAttribute('aria-pressed');
      button.setAttribute('role','switch');
      button.setAttribute('aria-checked', String(theme === 'dark'));
      button.setAttribute('aria-label', 'Tema escuro');
      button.title = theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro';
    }
  }

  function applyTheme(next) {
    theme = next === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(storageKey, theme); } catch {}
    updateControls();
  }

  document.documentElement.dataset.theme = theme;
  document.addEventListener('DOMContentLoaded', updateControls);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-toggle-theme]')) applyTheme(theme === 'light' ? 'dark' : 'light');
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey) {
      theme = event.newValue === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      updateControls();
    }
  });
})();
