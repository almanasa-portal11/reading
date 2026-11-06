// Service Worker - منصة سفير القراءة
// عند أي تعديل كبير على الملفات، غيّر رقم النسخة ليتحدث الكاش عند المستخدمين
const CACHE_NAME = 'safir-v10';

const APP_SHELL = [
  './',
  './index.html',
  './script.js',
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// مكتبات خارجية (Tailwind / Font Awesome / الخطوط) تُخزّن لتعمل الواجهة بدون إنترنت
const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
    );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // طلبات الذكاء الاصطناعي (POST) تمر مباشرة

  const url = new URL(req.url);

  // ملفات الموقع نفسه: الشبكة أولاً (لتصلك آخر نسخة) ثم الكاش عند انقطاع الإنترنت
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // المكتبات الخارجية: من الكاش فوراً وتحديث في الخلفية
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // باقي الطلبات (Google Sheet، الوسيط) تمر مباشرة بدون تخزين
});
