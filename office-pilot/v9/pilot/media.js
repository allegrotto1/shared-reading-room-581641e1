// The Studio edition decrypts each requested asset in this tab. The local pilot uses ordinary files.
const inStudio = document.documentElement.hasAttribute('data-research-studio');
const transport = inStudio ? import('./studio-access.js?rev=babylon9a') : null;

export async function enterPilot() {
  return transport ? (await transport).enter() : true;
}

export async function readMedia(path, onProgress) {
  return transport ? (await transport).read(path, onProgress) : fetch(path);
}

export async function mediaLocation(path, onProgress) {
  if (!transport) return {url: path, release() {}};
  const res = await readMedia(path, onProgress);
  if (!res.ok) throw Error('Asset unavailable');
  const url = URL.createObjectURL(await res.blob());
  return {url, release() { URL.revokeObjectURL(url); }};
}

export async function loadMedia(loader, path, onProgress) {
  const entry = await mediaLocation(path, onProgress);
  try {
    return await loader.loadAsync(entry.url, transport ? undefined : onProgress);
  } finally {
    entry.release();
  }
}
