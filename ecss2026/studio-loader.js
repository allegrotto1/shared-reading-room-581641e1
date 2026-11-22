(() => {
  'use strict';

  const script = document.currentScript;
  const directory = new URL(script.dataset.bundle + '/', script.src);
  const status = document.getElementById('share-status');
  const retry = document.getElementById('share-retry');
  const slot = 'studio-session:' + location.pathname.replace(/(?:ecss2026\/)?[^/]*$/, '');
  let opening = false;
  let opened = false;

  async function decrypt(url, key, { signal } = {}) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('read-failed');
    const ciphertext = new Uint8Array(await response.arrayBuffer());
    const compressed = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: ciphertext.subarray(0, 12)
    }, key, ciphertext.subarray(12));
    return new Response(
      new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))
    );
  }

  async function open() {
    if (opening || opened) return;
    let secret = new URLSearchParams(location.hash.slice(1)).get('key');
    if (!secret) {
      try { secret = sessionStorage.getItem(slot); } catch {}
    }
    retry.hidden = true;
    if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
      status.textContent = '請使用完整的研究分享連結開啟此頁。';
      return;
    }

    if (!globalThis.DecompressionStream || !globalThis.crypto?.subtle) {
      status.textContent = '此瀏覽器未能解開研究資料。請使用支援加密及 gzip 的瀏覽器。';
      return;
    }

    opening = true;
    status.textContent = '正在開啟研究…';
    try {
      const raw = Uint8Array.from(atob(secret.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
      const studio = {
        secret,
        async load(name, signal) {
          return (await decrypt(new URL(name + '.enc', directory), key, { signal })).json();
        },
        async readFile(relativeUrl, type) {
          const url = new URL(relativeUrl, script.src);
          const file = await decrypt(url, key);
          return new Blob([await file.blob()], { type });
        }
      };

      const app = await studio.load('app');
      if (new URLSearchParams(location.hash.slice(1)).get('key') &&
          new URLSearchParams(location.hash.slice(1)).get('key') !== secret) {
        opening = false;
        open();
        return;
      }
      try { sessionStorage.setItem(slot, secret); } catch {}
      const params = new URLSearchParams(location.hash.slice(1));
      params.set('key', secret);
      if (!params.has('view')) params.set('view', 'projects');
      history.replaceState(null, '', '#' + params.toString());

      const style = document.createElement('style');
      style.textContent = app.css;
      document.head.append(style);
      document.getElementById('share-style').remove();
      document.title = '誰是落選者｜Research Studio';

      const body = document.createElement('template');
      body.innerHTML = app.body;
      document.body.replaceChildren(body.content);
      window.__researchStudio = { ...studio, data: app.data };
      const runtime = document.createElement('script');
      runtime.textContent = app.js;
      document.body.append(runtime);
      opened = true;
      window.removeEventListener('hashchange', open);
    } catch (error) {
      if (error.name === 'OperationError') {
        status.textContent = '此分享連結未能開啟，請使用原有完整研究分享連結。';
      } else {
        status.textContent = '暫時未能載入研究頁面。';
        retry.hidden = false;
      }
    } finally {
      opening = false;
    }
  }

  retry.addEventListener('click', open);
  window.addEventListener('hashchange', open);
  open();
})();
