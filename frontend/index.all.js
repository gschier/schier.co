import './styles/styles.css';

// Inject CSS to enable transitions after a delay. The delay
// is to prevent the transitions from happening on page load.
setTimeout(() => {
    const css = 'html,button{transition:all 250ms}';
    const style = document.createElement('style');
    style.innerHTML = css;
    document.querySelector('head').appendChild(style);
}, 1000);
