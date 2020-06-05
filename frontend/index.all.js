import './styles/styles.css';

// Handle theme toggling
const htmlEl = document.querySelector('html');
document.querySelectorAll('[data-toggle-theme]').forEach((el) => {
  el.addEventListener('click', e => {
    e.preventDefault();
    const theme = htmlEl.getAttribute('theme') || '';
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', newTheme);
    htmlEl.setAttribute('theme', newTheme);
    showIcon();
  });
});

function showIcon() {
  const theme = htmlEl.getAttribute('theme') || '';
  document.querySelectorAll('[data-toggle-theme]').forEach(el => {
    const iconLight = el.querySelector('[data-theme="light"]');
    const iconDark = el.querySelector('[data-theme="dark"]');
    if (theme === 'dark') {
      iconLight.style.display = 'none';
      iconDark.style.display = 'inline-block';
    } else {
      iconLight.style.display = 'inline-block';
      iconDark.style.display = 'none';
    }
  });
}

showIcon();
