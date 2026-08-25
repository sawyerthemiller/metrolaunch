/* ================================================================
   METRO LAUNCHER — News Service
   ----------------------------------------------------------------
   Owns all networking, caching, polling, and DOM rendering for the
   news live tile (Hacker News). Also owns the headline
   text-cleaning helper.
   ================================================================ */
/** biome-ignore-all lint/complexity/useOptionalChain: <explanation> */
/** biome-ignore-all lint/complexity/useArrowFunction: <explanation> */

(function () {
  const TILE_ID = '__news__';
  const CACHE_KEY = 'metro_news_cache';
  const TTL_MS = 60 * 60 * 1000;
  const TOP_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
  const ITEM_URL = id => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
  const HEADLINE_COUNT = 15;

  const RSS_FEEDS = {
    cnn: 'http://rss.cnn.com/rss/cnn_topstories.rss',
    nbc: 'https://feeds.nbcnews.com/nbcnews/public/news',
    abc: 'https://abcnews.go.com/abcnews/topstories',
    cbs: 'https://www.cbsnews.com/latest/rss/main',
    cbc: 'https://www.cbc.ca/webfeed/rss/rss-topstories',
    bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
    npr: 'https://feeds.npr.org/1001/rss.xml',
    fox: 'https://moxie.foxnews.com/google-publisher/latest.xml'
  };

  let deps = null;
  let data = [];
  let index = 0;
  let pollTimer = null;
  let hasLoaded = false;
  let hasFailed = false;

  // Text cleaning regex numero uno

  function cleanHeadline(title) {
    if (!title) return '';
    if (deps && deps.getSettings && deps.getSettings().disableRegexCleaning) {
      return title.trim();
    }
    return title
      .replace(/&/g, 'and')
      .replace(/GitHub/g, 'Github')
      .replace(/A\.I\.?/gi, 'AI')
      .replace(/\s*\[([^\]]+)\]/g, ' $1')
      .replace(/[-+\u2013\u2014\u2212]\s*\$/g, '')

      .replace(/["'‘’”“`@|:;+\u00B1$?,#\u235C\u2192•·]/g, '')
      .replace(/[\u2013\u2014_]/g, '-')
      .replace(/\s*\.{3,}$/, '...')
      .replace(/ő/g, 'o')
      .replace(/á/g, 'a')
      .replace(/ñ/g, 'n')
      .replace(/\bvs\./gi, 'vs')
      .replace(/\b0+(\d+)/g, '$1')

      .trim()
      .replace(/([^.])\.$/, '$1');
  }

  function cacheGet(currentProvider, currentCustomUrl) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (Date.now() - obj.ts > TTL_MS) return null;
      if (obj.provider !== currentProvider || obj.customUrl !== currentCustomUrl) return null;
      return obj.data;
    } catch { return null; }
  }

  function cacheSet(v, currentProvider, currentCustomUrl) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: v, provider: currentProvider, customUrl: currentCustomUrl })); } catch { }
  }

  function init(injected) {
    deps = injected;
  }

  function fetchHackerNews() {
    return fetch(TOP_URL, { cache: 'no-store' })
      .then(r => r.json())
      .then(ids => {
        const top = ids.slice(0, HEADLINE_COUNT);
        return Promise.all(top.map(id => fetch(ITEM_URL(id), { cache: 'no-store' }).then(r => r.json())));
      })
      .then(stories => stories.filter(s => s?.title && s.url).map(s => ({ title: s.title, url: s.url })));
  }

  function fetchRssNews(feedUrl) {
    if (!window.MetroRuntime || !window.MetroRuntime.News) return Promise.reject(new Error("Uninitialized"));
    return window.MetroRuntime.News.fetchRss(feedUrl)
      .then(r => r.text())
      .then(xmlStr => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, "text/xml");
        
        let items = Array.from(doc.querySelectorAll('item'));
        if (!items.length) {
          items = Array.from(doc.querySelectorAll('entry'));
        }
        
        const stories = [];
        for (const item of items) {
          if (stories.length >= HEADLINE_COUNT) break;
          const titleEl = item.querySelector('title');
          const title = titleEl ? titleEl.textContent : '';
          
          let link = '';
          const linkEl = item.querySelector('link');
          if (linkEl) {
            if (linkEl.textContent && linkEl.textContent.trim()) {
              link = linkEl.textContent.trim();
            } else if (linkEl.getAttribute('href')) {
              link = linkEl.getAttribute('href');
            }
          }
          
          if (title && link) {
            stories.push({ title, url: link });
          }
        }
        return stories;
      });
  }

  function fetchData() {
    const tile = deps && deps.getTile && deps.getTile(TILE_ID);
    let provider = tile && tile.newsProvider ? tile.newsProvider : 'hn';
    let customUrl = tile && tile.customRssUrl ? tile.customRssUrl.trim() : '';

    const consent = localStorage.getItem('metrolaunch_backend_consent') === '1';
    const runtimeReady = !!window.MetroRuntime;

    if (!consent || !runtimeReady) {
      if (provider !== 'hn' || customUrl) {
        try { localStorage.removeItem(CACHE_KEY); } catch { }
      }
      provider = 'hn';
      customUrl = '';
    }

    function applyFiltersAndDisplay(stories, tile) {
      const removeJobs = tile ? tile.removeJobs !== false : true;
      const removeAi = tile && !!tile.removeAi;
      const enableStoryControl = tile && !!tile.enableStoryControl;
      const storyControl = enableStoryControl && tile.storyControl ? tile.storyControl.toLowerCase().trim().split(/\s+/) : [];

      data = stories
        .filter(s => !(removeJobs && s.title.toLowerCase().includes('hiring')))
        .filter(s => !(removeAi && /(?:\bai\b|a\.i\.?|\bopenai\b)/.test(s.title.toLowerCase())))
        .filter(s => {
          if (storyControl.length === 0 || (storyControl.length === 1 && storyControl[0] === '')) return true;
          const lowerTitle = s.title.toLowerCase();
          const titleWords = lowerTitle.split(/\W+/).filter(w => w.length > 0);
          return !storyControl.some(word => {
            return lowerTitle.includes(word) || 
              titleWords.some(tw => tw.length >= 4 && word.includes(tw));
          });
        });
      hasLoaded = true;
      hasFailed = false;
      index = 0;
      updateFace();
    }

    const cached = cacheGet(provider, customUrl);
    if (cached?.length) {
      applyFiltersAndDisplay(cached, tile);
      return Promise.resolve();
    }

    // offline - keep any stale data currently shown - retry when back online
    if (!navigator.onLine) {
      updateFace();
      return Promise.resolve();
    }
    
    let fetchPromise;
    if (customUrl) {
      fetchPromise = fetchRssNews(customUrl);
    } else if (provider === 'hn') {
      fetchPromise = fetchHackerNews();
    } else if (RSS_FEEDS[provider]) {
      fetchPromise = fetchRssNews(RSS_FEEDS[provider]);
    } else {
      fetchPromise = fetchHackerNews();
    }

    return fetchPromise
      .then(stories => {
        cacheSet(stories, provider, customUrl);
        applyFiltersAndDisplay(stories, tile);
      })
      .catch(() => {
        data = [];
        hasLoaded = false;
        hasFailed = true;
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
        const tile = deps && deps.getTile && deps.getTile(TILE_ID);
        let provider = tile && tile.newsProvider ? tile.newsProvider : 'hn';
        let customUrl = tile && tile.customRssUrl ? tile.customRssUrl.trim() : '';

        const consent = localStorage.getItem('metrolaunch_backend_consent') === '1';
        const runtimeReady = !!window.MetroRuntime;

        if (!consent || !runtimeReady) {
          provider = 'hn';
          customUrl = '';
        }

        let sourceName = 'Hacker News';
        if (customUrl) {
          sourceName = 'Custom RSS';
        } else {
          const pnames = { hn: 'Hacker News', cnn: 'CNN', nbc: 'NBC', abc: 'ABC', cbs: 'CBS', cbc: 'CBC', bbc: 'BBC', npr: 'NPR', fox: 'FOX' };
          sourceName = pnames[provider] || 'Hacker News';
        }

        el.innerHTML =
          `<div class="news-headline"${lc}>${escHtml(title)}</div>` +
          `<div class="news-divider"></div>` +
          `<div class="news-source">${escHtml(sourceName)}</div>`;
      } else if (hasLoaded) {
        let title = 'The set filters have removed all stories';
        if (settings.newsLowercase && settings.newsCapitaliseFirst) {
          lc = '';
          title = title.toLowerCase();
          if (title.length > 0 && title[0].match(/[a-z]/i)) {
            title = title.charAt(0).toUpperCase() + title.slice(1);
          }
        }
        el.innerHTML = `<div class="news-headline"${lc}>${escHtml(title)}</div>`;
      } else if (hasFailed) {
        el.innerHTML = '<div class="weather-nodata">Failed to load headlines\u2026</div>';
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
    hasData: () => data.length > 0 || hasLoaded || hasFailed,
  };
})();
