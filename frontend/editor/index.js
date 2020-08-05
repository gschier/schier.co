// JavaScript
import { initCodemirror } from './codemirror';

// Fetch necessary DOM nodes
const contentEl = document.querySelector('textarea[name=content]');
const editorContainerEl = document.querySelector('#editor-container');

// Store body overflow so we can reset it later. When the full-screen modal
// shows it will set body's overflow to hidden to prevent scrolling from
// behind the modal.
const bodyOverflowDefault = document.body.style.overflow;

export function init() {
  // Bind to buttons that toggle fullscreen behavior
  document.body.addEventListener('click', e => {
    if (e.target.hasAttribute('data-toggle-expand')) {
      toggleExpand(e);
    }
  });

  contentEl.addEventListener('keyup', e => {
    handleChange(e);
  });
  setupInitialForm();
}

function handleChange(e) {
  // Already contains a <!--more-->
  if (e.target.value.includes('<!--more-->')) {
    e.target.setCustomValidity('');
    return;
  }

  // Only one paragraph, so doesn't need one
  if (!e.target.value.includes('\n\n')) {
    e.target.setCustomValidity('');
    return;
  }

  const validity = 'Missing <!--more--> tag';
  e.target.setCustomValidity(validity);
}

function toggleExpand(e) {
  e.preventDefault();

  if (editorContainerEl.classList.contains('editor--hide')) {
    editorContainerEl.classList.remove('editor--hide');
    document.body.style.overflow = 'hidden';
  } else {
    editorContainerEl.classList.add('editor--hide');
    document.body.style.overflow = bodyOverflowDefault; // Reset overflow
  }

  let debounceTimeout = 0;
  let previewCount = 0;
  const update = (debounceMillis = 0) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      const p = document.querySelector('.blog-post-editor__preview');
      if (p.querySelectorAll('iframe').length === 0) {
        for (let i = 0; i < 2; i++) {
          const f = document.createElement('iframe');
          f.id = `preview-frame-${i}`;
          f.style.display = 'none';
          p.appendChild(f);
        }
      }

      // Swap between two i-frames to prevent loading flicker
      const oldPrevEl = document.querySelector('#preview-frame-' + (previewCount % 2));
      const newPrevEl = document.querySelector('#preview-frame-' + ((previewCount + 1) % 2));
      previewCount++;

      // If the iFrame already had content, we can just fetch the partial and replace it. This
      // prevents it from having to re-fetch the scripts and styles and stuff.
      const partial = newPrevEl.contentDocument.querySelector('.blog-post-container') ? 'true' : 'false';

      // Fetch the preview from server
      const formData = new FormData();
      formData.append('partial', partial);

      // Add each form input value to form data
      Array.from(document.querySelectorAll('#edit-form input, #edit-form textarea'))
        .filter(el => el.hasAttribute('name'))
        .forEach(el => formData.append(el.getAttribute('name'), el.value));

      // Send the AJAX request to fetch the render HTML
      const csrfTokenHeaderName = document.body.getAttribute('data-csrf-token-header');
      const csrfToken = document.body.getAttribute('data-csrf-token');
      const headers = { [csrfTokenHeaderName]: csrfToken };
      const resp = await fetch('/blog/render', { headers, method: 'POST', body: formData });
      const previewHtml = await resp.text();

      const oldScrollTop = oldPrevEl.contentDocument.scrollingElement.scrollTop;

      if (partial === 'true') {
        // Basic swap of blog post inside already-loaded page
        newPrevEl.contentDocument.querySelector('.blog-post-container').innerHTML = previewHtml;
        oldPrevEl.style.display = 'none';
        newPrevEl.style.display = 'block';
        newPrevEl.contentDocument.scrollingElement.scrollTop = oldScrollTop;
      } else {
        // Replace entire document
        newPrevEl.addEventListener('load', () => {
          oldPrevEl.style.display = 'none';
          newPrevEl.style.display = 'block';
          newPrevEl.contentDocument.scrollingElement.scrollTop = oldScrollTop;
        });
        newPrevEl.contentWindow.document.open();
        newPrevEl.contentWindow.document.write(previewHtml);
        newPrevEl.contentWindow.document.close();
      }
    }, debounceMillis);
  };

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
  // Handle Image Uploads on Paste/Drag //
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

  let cm = null;
  setTimeout(() => {
    if (cm) {
      cm.refresh();
    } else {
      cm = initCodemirror(contentEl, document.querySelector('#editor'));
      cm.on('change', () => update(500));

      const upImg = async (cm, e) => {
        const { url, name } = await upload(e.dataTransfer || e.clipboardData);
        const doc = cm.getDoc();
        const cur = doc.getCursor();
        doc.replaceRange(`\n${mdImage(url, name)}\n`, cur);
      };

      cm.on('paste', upImg);
      cm.on('drop', upImg);
      cm.focus();
    }

    update(0);
  });
}

function setupInitialForm() {
  const contentEl = document.querySelector('textarea[name=content]');
  contentEl.addEventListener('paste', async e => {
    const { url, name } = await upload(e.clipboardData);
    const img = mdImage(url, name);

    if (contentEl.selectionStart) {
      const startPos = contentEl.selectionStart;
      const endPos = contentEl.selectionEnd;
      const before = contentEl.value.substring(0, startPos);
      const after = contentEl.value.substring(endPos, contentEl.value.length);

      //  Update value
      contentEl.value = before + img + after;

      // Not sure why this can't be done right away
      setTimeout(() => contentEl.setSelectionRange(startPos, startPos + img.length));
    } else {
      contentEl.value += img;
    }
  });

  const imageEl = document.querySelector('input[name=image]');
  imageEl.addEventListener('paste', async e => {
    const { url } = await upload(e.clipboardData);
    imageEl.value = url;
  });
  imageEl.addEventListener('dragenter', e => e.preventDefault());
  imageEl.addEventListener('dragover', e => {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  imageEl.addEventListener('drop', async e => {
    e.preventDefault();
    const { url } = await upload(e.dataTransfer);
    imageEl.value = url;
  });
}

function mdImage(url, name) {
  return `![${name}](${url})`;
}

function upload(data) {
  return new Promise(resolve => {
    for (const item of data.items) {
      if (item.type.indexOf('image/') !== 0) {
        // Skip non-images
        continue;
      }

      const csrfTokenHeaderName = document.body.getAttribute('data-csrf-token-header');
      const csrfToken = document.body.getAttribute('data-csrf-token');
      const file = item.getAsFile();
      const reader = new FileReader();

      reader.onload = async e => {
        const body = new FormData();
        const headers = { [csrfTokenHeaderName]: csrfToken };
        body.append('file', file);

        const resp = await fetch('/api/blog/assets', { method: 'PUT', body, headers });
        const { url } = await resp.json();
        resolve({ url, name: file.name });
      };
      reader.readAsArrayBuffer(file);
    }
  });
}
