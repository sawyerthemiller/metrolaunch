/* ================================================================
   METRO LAUNCHER — News Service
   ----------------------------------------------------------------
   Owns all networking, caching, polling, and DOM rendering for the
   news live tile (Hacker News). Also owns the headline
   text-cleaning helper.
   ================================================================ */

(function () {
  const TILE_ID = '__news__';
  const CACHE_KEY = 'metro_news_cache';
  const TTL_MS = 60 * 60 * 1000;
  const TOP_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
  const ITEM_URL = id => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
  const HEADLINE_COUNT = 15;

  let deps = null;
  let data = [];
  let index = 0;
  let pollTimer = null;

  // Text cleaning regex numero uno

  function cleanHeadline(title) {
    if (!title) return '';
    if (deps && deps.getSettings && deps.getSettings().disableRegexCleaning) {
      return title.trim();
    }
    return title
      .replace(/GitHub/g, 'Github')
      .replace(/A\.I\.?/gi, 'AI')
      .replace(/\s*\[([^\]]+)\]/g, ' $1')
      .replace(/[-+\u2013\u2014\u2212]\s*\$/g, '')

      .replace(/["'’”“`@:;+\u00B1$?,\u235C\u2192•·]/g, '')
      .replace(/[\u2013\u2014_]/g, '-')
      .replace(/\s*\.{3,}$/, '...')
      .replace(/ő/g, 'o')
      .replace(/\bvs\./gi, 'vs')
      .replace(/\b0+(\d+)/g, '$1')

      .trim()
      .replace(/([^.])\.$/, '$1');
  }

  function cacheGet() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > TTL_MS) return null;
      return obj.data;
    } catch { return null; }
  }

  function cacheSet(v) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: v })); } catch { }
  }

  function init(injected) {
    deps = injected;
  }

  function fetchData() {
    const cached = cacheGet();
    if (cached?.length) {
      data = cached;
      index = 0;
      updateFace();
      return Promise.resolve();
    }

    // offline - keep any stale data currently shown - retry when back online
    if (!navigator.onLine) {
      updateFace();
      return Promise.resolve();
    }

    return fetch(TOP_URL, { cache: 'no-store' })
      .then(r => r.json())
      .then(ids => {
        const top = ids.slice(0, HEADLINE_COUNT);
        return Promise.all(top.map(id => fetch(ITEM_URL(id), { cache: 'no-store' }).then(r => r.json())));
      })
      .then(stories => {
        const tile = deps && deps.getTile && deps.getTile(TILE_ID);
        const removeJobs = tile ? tile.removeJobs !== false : true;

        data = stories
          .filter(s => s?.title && s.url)
          .filter(s => !(removeJobs && s.title.toLowerCase().includes('hiring')))
          .map(s => ({ title: s.title, url: s.url }));
        cacheSet(data);
        index = 0;
        updateFace();
      })
      .catch(() => {
        data = [];
        updateFace();
      });
  }

  function currentItem() {
    return data.length ? data[index % data.length] : null;
  }

  function advanceItem() {
    if (data.length > 1) {
      index = (index + 1) % data.length;
      updateFace();
    }
  }

  function updateFace() {
    const settings = deps.getSettings();
    const escHtml = deps.escHtml;
    const offline = !navigator.onLine;
    let lc = settings.newsLowercase ? ' style="text-transform:lowercase"' : '';
    document.querySelectorAll('.news-back-content').forEach(el => {
      if (offline) {
        // blank while offline — the `online` listener will refetch and repaint
        el.innerHTML = '';
        return;
      }
      const item = currentItem();
      if (item) {
        let title = cleanHeadline(item.title);
        if (settings.newsLowercase && settings.newsCapitaliseFirst) {
          lc = '';
          title = title.toLowerCase();
          if (title.length > 0 && title[0].match(/[a-z]/i)) {
            title = title.charAt(0).toUpperCase() + title.slice(1);
          }
        }
        el.innerHTML =
          `<div class="news-headline"${lc}>${escHtml(title)}</div>` +
          `<div class="news-divider"></div>` +
          `<div class="news-source">Hacker News</div>`;
      } else {
        el.innerHTML = '<div class="weather-nodata">Loading headlines\u2026</div>';
      }
    });
  }

  function start() {
    stop();
    const settings = deps.getSettings();
    if (!settings.newsEnabled) return;
    fetchData();
    pollTimer = setInterval(() => {
      localStorage.removeItem(CACHE_KEY);
      fetchData();
    }, TTL_MS);
  }

  function stop() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function purgeCache() {
    localStorage.removeItem(CACHE_KEY);
  }

  function isRunning() {
    return pollTimer !== null;
  }

  window.NewsService = {
    TILE_ID,
    CACHE_KEY,
    init,
    fetchData,
    updateFace,
    start,
    stop,
    purgeCache,
    isRunning,
    currentItem,
    advanceItem,
    cleanHeadline,
    getData: () => data,
    hasData: () => data.length > 0,
  };
})();
