import './styles/styles.css';

for (const el of document.querySelectorAll('[data-toggle-theme]')) {
  el.addEventListener('click', e => {
    e.preventDefault();
    const theme = document.querySelector('html').getAttribute('theme') || '';
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    document.querySelector('html').setAttribute('theme', newTheme);
    localStorage.setItem('theme', newTheme);
  })
}
