/* Launcher PWA - Service Worker

- Stratégie: network-first avec fallback cache */

var CACHE_NAME = ‘launcher-cache-v4’;
var CORE_ASSETS = [
‘./’,
‘./index.html’,
‘./manifest.json’
];

self.addEventListener(‘install’, function (event) {
event.waitUntil(
caches.open(CACHE_NAME).then(function (cache) {
return cache.addAll(CORE_ASSETS).catch(function () { /* ignore */ });
}).then(function () {
return self.skipWaiting();
})
);
});

self.addEventListener(‘activate’, function (event) {
event.waitUntil(
caches.keys().then(function (keys) {
return Promise.all(keys.map(function (k) {
if (k !== CACHE_NAME) return caches.delete(k);
}));
}).then(function () {
return self.clients.claim();
})
);
});

self.addEventListener(‘fetch’, function (event) {
var req = event.request;

if (req.method !== ‘GET’) return;

event.respondWith(
fetch(req).then(function (response) {
if (response && response.status === 200 && response.type === ‘basic’) {
var clone = response.clone();
caches.open(CACHE_NAME).then(function (cache) {
cache.put(req, clone).catch(function () { /* ignore */ });
});
}
return response;
}).catch(function () {
return caches.match(req).then(function (cached) {
if (cached) return cached;
return caches.match(’./index.html’);
});
})
);
});