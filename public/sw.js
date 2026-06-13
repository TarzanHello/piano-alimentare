// ─── Service Worker · Piano Alimentare Familiare ──────────────────
// Strategia: cache-first per gli asset noti, con caching dinamico
// delle librerie esterne (React, Babel) al primo caricamento online.
// Così l'app funziona davvero offline dopo la prima apertura.

const CACHE = "piano-alimentare-v22";

// Asset locali dell'app
const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
];

// (nessuna libreria CDN: la build Vite include tutto negli asset locali)
const CDN_ASSETS = [];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      // Gli asset locali sono obbligatori
      await cache.addAll(LOCAL_ASSETS);
      // I CDN sono "best effort": se uno fallisce non blocca l'installazione
      await Promise.allSettled(
        CDN_ASSETS.map(url =>
          fetch(url, { mode: "cors" })
            .then(res => { if (res.ok) return cache.put(url, res); })
            .catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  // Gestiamo solo le richieste GET
  if (req.method !== "GET") return;

  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req)
        .then(res => {
          // Cacha dinamicamente le risposte valide (incluse le librerie CDN)
          if (res && res.ok && (res.type === "basic" || res.type === "cors")) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => {
          // Offline e non in cache: per le navigazioni torna alla home
          if (req.mode === "navigate") return caches.match("./index.html");
          return new Response("", { status: 504, statusText: "Offline" });
        });
    })
  );
});

// ─── Notifiche push locali ─────────────────────────────────────────
// Il client manda un messaggio { type:"SCHEDULE_NOTIFICATIONS", meals:[...] }
// dove ogni meal ha { mealKey, label, ricetta, delayMs }
// Il SW usa setTimeout per far scattare la notifica al momento giusto.

const scheduledTimers = {};

self.addEventListener("message", e => {
  if (!e.data) return;

  if (e.data.type === "SCHEDULE_NOTIFICATIONS") {
    // Cancella timer precedenti
    Object.values(scheduledTimers).forEach(id => clearTimeout(id));
    Object.keys(scheduledTimers).forEach(k => delete scheduledTimers[k]);

    const meals = e.data.meals || [];
    meals.forEach(meal => {
      if (meal.delayMs < 0) return; // già passato
      const id = setTimeout(() => {
        self.registration.showNotification(meal.label, {
          body: meal.ricetta || "È il momento di mangiare!",
          icon: "./icon-192.png",
          badge: "./icon-192.png",
          tag: meal.mealKey,
          renotify: true,
          data: { mealKey: meal.mealKey },
        });
      }, Math.min(meal.delayMs, 2147483647)); // max setTimeout ~24.8 giorni
      scheduledTimers[meal.mealKey] = id;
    });
  }

  if (e.data.type === "CANCEL_NOTIFICATIONS") {
    Object.values(scheduledTimers).forEach(id => clearTimeout(id));
    Object.keys(scheduledTimers).forEach(k => delete scheduledTimers[k]);
  }
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        self.clients.openWindow("./");
      }
    })
  );
});
