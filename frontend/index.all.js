import './styles/styles.css';

// Handle theme toggling
const htmlEl = document.querySelector('html');
document.querySelectorAll('[data-toggle-theme]').forEach((el) => {
  el.addEventListener('click', e => {
    e.preventDefault();
    let theme = htmlEl.getAttribute('theme') || 'auto';
    let newTheme = theme;

    if (e.metaKey || e.ctrlKey) {
      newTheme = '';
    } else {
      newTheme = theme.includes('dark') ? 'light' : 'dark';
    }

    localStorage.setItem('theme', newTheme);
    htmlEl.setAttribute('theme', newTheme);
    showIcon();
  });
});

function showIcon() {
  const theme = htmlEl.getAttribute('theme') || 'light-auto';

  document.querySelectorAll('[data-toggle-theme]').forEach(el => {
    const iconAuto = el.querySelector('[data-theme="auto"]');
    const iconLight = el.querySelector('[data-theme="light"]');
    const iconDark = el.querySelector('[data-theme="dark"]');

    iconAuto.style.display = theme.includes('-auto') ? 'inline-block' : 'none';
    iconLight.style.display = theme === 'light' ? 'inline-block' : 'none';
    iconDark.style.display = theme === 'dark' ? 'inline-block' : 'none';

    console.log('Using theme', theme);
  });
}

showIcon();
