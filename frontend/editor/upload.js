export function upload(data) {
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
