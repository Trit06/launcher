// Launcher — Service Worker v5.15
// Stratégie : on sert TOUJOURS le cache d'abord (démarrage instantané, même en mode avion),
// et on met à jour en arrière-plan quand le réseau est là. Jamais d'attente réseau bloquante.
const VERSION = 'v5.15';
const SHELL_CACHE = 'launcher-shell-' + VERSION;
const CDN_CACHE = 'launcher-cdn'; // conservé d'une version à l'autre (React, Babel, Tailwind… pour les apps JSX)
const SHELL_FILES = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Un fichier manquant ne doit pas faire échouer toute l'installation
    await Promise.all(SHELL_FILES.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok) await cache.put(url, res);
      } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const fresh = await caches.open(SHELL_CACHE);
    const hasShell = await fresh.match('./', { ignoreSearch: true }) || await fresh.match('./index.html', { ignoreSearch: true });
    // On ne supprime les anciens caches QUE si le nouveau contient bien le launcher
    if (hasShell) {
      await Promise.all(keys
        .filter((k) => k.startsWith('launcher-shell-') && k !== SHELL_CACHE)
        .map((k) => caches.delete(k)));
    }
    await self.clients.claim();
  })());
});

// Cherche une page du launcher dans n'importe quel cache (nouveau ou ancien)
async function matchShell(request) {
  return (await caches.match(request, { ignoreSearch: true }))
    || (await caches.match('./', { ignoreSearch: true }))
    || (await caches.match('./index.html', { ignoreSearch: true }));
}

async function updateInBackground(request, cacheName, key) {
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    if (res && (res.ok || res.type === 'opaque')) {
      const cache = await caches.open(cacheName);
      await cache.put(key || request, res.clone());
    }
    return res;
  } catch (e) {
    return null; // hors ligne : on ignore, le cache fait le travail
  }
}

const OFFLINE_PAGE = '<!DOCTYPE html><html lang="fr"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<body style="background:#0a0a14;color:#e4ccff;font-family:Courier New,monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px">' +
  '<div><div style="font-size:48px">📡</div><p>Launcher pas encore en cache.<br>Ouvre-le une fois avec du réseau.</p></div></body></html>';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1) Ouverture du launcher (navigation) : cache immédiat + mise à jour en fond
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await matchShell(req);
      const update = updateInBackground(req, SHELL_CACHE, './');
      if (cached) {
        event.waitUntil(update);
        return cached;
      }
      const res = await update;
      return res || new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    })());
    return;
  }

  // 2) Fichiers du launcher (manifest, icônes…) : cache d'abord + mise à jour en fond
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      const update = updateInBackground(req, SHELL_CACHE);
      if (cached) { event.waitUntil(update); return cached; }
      return (await update) || new Response('', { status: 504 });
    })());
    return;
  }

  // 3) Ressources externes (CDN des apps JSX) : cache d'abord, réseau sinon
  event.respondWith((async () => {
    const cache = await caches.open(CDN_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
