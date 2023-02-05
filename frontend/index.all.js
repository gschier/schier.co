import './styles/styles.css';

// Inject CSS to enable transitions after a delay. The delay
// is to prevent the transitions from happening on page load.
setTimeout(() => {
    const css = '*{transition:all 150ms ease-in-out}';
    const style = document.createElement('style');
    style.innerHTML = css;
    document.querySelector('head').appendChild(style);
}, 1000);
