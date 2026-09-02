const CACHE_NAME = 'metro-launcher-v28';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './search.js',
    './community.js',
    './services/weather.js',
    './services/news.js',
    './services/spotify.js',
    './services/events.js',
    './manifest.json',
    './version.txt',
    './ios-haptics.js',
    './segoe-ui-supro.otf',
    './navbar_icon/back.png',
    './navbar_icon/start.png',
    './navbar_icon/search.png',
    './system_icon/share.png',
    './system_icon/arrow-rite.png',
    './system_icon/exit.png',
    './system_icon/pull.png',
    './system_icon/store.png',
    './system_icon/paint.png',
    './system_icon/walk.png',
    './system_icon/zzz.png',
    './system_icon/events.png',
    './system_icon/no-repeat.png',
    './weather_bg/01d.jpg',
    './weather_bg/01n.jpg',
    './weather_bg/02d.jpg',
    './weather_bg/02n.jpg',
    './weather_bg/03d.jpg',
    './weather_bg/03n.jpg',
    './weather_bg/04d.jpg',
    './weather_bg/04n.jpg',
    './weather_bg/09d.jpg',
    './weather_bg/09n.jpg',
    './weather_bg/10d.jpg',
    './weather_bg/10n.jpg',
    './weather_bg/11d.jpg',
    './weather_bg/11n.jpg',
    './weather_bg/13d.jpg',
    './weather_bg/13n.jpg',
    './weather_bg/50d.jpg',
    './weather_bg/50n.jpg'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.all(
                ASSETS_TO_CACHE.map(asset => {
                    return cache.add(asset).catch(err => {
                        console.warn('Failed to cache asset:', asset, err);
                    });
                })
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => caches.delete(cacheName))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // only handle GET requests
    if (event.request.method !== 'GET') return;

    // skip non-http/https requests
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);

    // If the request has cache-busting params get out of the way
    // I'm not in your way chef... GORDON - 'Fuck off upstairs then!!!'
    if (url.searchParams.has('t') || url.searchParams.has('_nocache') || url.searchParams.has('_ml_reload')) {
        return;
    }
    
    // explicitly prevent caching of dynamic data for live tiles
    if (url.hostname.includes('leopardindustries.net') ||  // for spotify status
        url.hostname.includes('firebaseio') ||             // for news (default)
        url.hostname.includes('cors.lol') ||               // for news (custom)
        url.hostname.includes('api.openweathermap.org')) { // for weather
        return;
    }

    // allow same-origin requests or cross-origin image requests
    if (url.origin !== location.origin && event.request.destination !== 'image') return;

    event.respondWith(
        (async () => {
            // ignore query strings on navigation requests to match cached index
            const matchOptions = {
                ignoreSearch: event.request.mode === 'navigate'
            };

            // offline-first strategy cache first, fallback to network
            const cachedResponse = await caches.match(event.request, matchOptions);
            if (cachedResponse) {
                return cachedResponse;
            }

            try {
                const networkResponse = await fetch(event.request);

                // if it's a valid response, cache it dynamically for future use offline
                if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(event.request, networkResponse.clone());
                }

                return networkResponse;
            } catch (error) {
                // if network fails and not in cache fallback to index for navigation
                if (event.request.mode === 'navigate') {
                    const fallback = await caches.match('./index.html', { ignoreSearch: true });
                    if (fallback) return fallback;
                }
                throw error;
            }
        })()
    );
});
