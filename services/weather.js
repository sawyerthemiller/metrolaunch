/* ================================================================
   METRO LAUNCHER — Weather Service
   ----------------------------------------------------------------
   Owns all networking, caching, polling, and DOM rendering for the
   Weather live tile.
   ================================================================ */

(function () {
  const TILE_ID = '__weather__';
  const CACHE_KEY = 'metro_weather_cache_v2';
  const TTL_MS = 5 * 60 * 1000;
  const AVAILABLE_ICONS = [
    '01d', '01n', '02d', '02n', '03d', '03n', '04d', '04n',
    '09d', '09n', '10d', '10n', '11d', '11n', '13d', '13n',
    '50d', '50n',
  ];

  let deps = null;
  let data = null;
  let loading = false;
  let pollTimer = null;
  let lastFetchTs = 0;

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
    const settings = deps.getSettings();
    const zip = settings.weatherZip;

    if (!zip || !settings.weatherApiKey || !settings.weatherCountry) {
      data = null;
      loading = false;
      updateFace();
      return Promise.resolve();
    }

    const cached = cacheGet();
    if (cached && cached._zip === zip) {
      data = cached;
      loading = false;
      updateFace();
      lastFetchTs = Date.now();
      return Promise.resolve();
    }

    // offline - don't attempt the network
    if (!navigator.onLine) {
      loading = false;
      updateFace();
      return Promise.resolve();
    }

    loading = true;
    data = null;
    updateFace();

    const units = settings.weatherUseCelsius ? 'metric' : 'imperial';
    const url = `https://api.openweathermap.org/data/2.5/weather?zip=${encodeURIComponent(zip)},${settings.weatherCountry}&appid=${settings.weatherApiKey}&units=${units}`;

    return fetch(url, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => {
        if (!d.main) return;

        const iconCode = d.weather?.length ? d.weather[0].icon : '01d';
        const mappedIcon = AVAILABLE_ICONS.includes(iconCode) ? iconCode : '01d';

        data = {
          _zip: zip,
          location: d.name || zip,
          temp: `${Math.round(d.main.temp)}\u2009\u00B0${settings.weatherUseCelsius ? 'C' : 'F'}`,
          condition: d.weather?.length ? d.weather[0].main : '',
          bgUrl: `./weather_bg/${mappedIcon}.jpg`,
        };
        loading = false;
        lastFetchTs = Date.now();
        cacheSet(data);
        updateFace();
      })
      .catch(() => {
        data = null;
        loading = false;
        updateFace();
      });
  }

  function _renderWeatherTile(el, bgStyle) {
    const escHtml = deps.escHtml;
    el.innerHTML =
      `<div class="weather-bg-blur"${bgStyle}></div>` +
      `<div class="weather-location">${escHtml(data.location)}</div>` +
      `<div class="weather-condition">${escHtml(data.condition)}</div>` +
      `<div class="weather-temp">${escHtml(data.temp)}</div>`;
  }

  function updateFace() {
    const escHtml = deps.escHtml;
    const offline = !navigator.onLine;
    const elements = document.querySelectorAll('.weather-back-content');

    if (offline) {
      elements.forEach(el => { el.innerHTML = ''; });
    } else if (data) {
      if (data.bgUrl) {
        // preload the image so the tile doesn't flash without a background
        const img = new Image();
        img.src = data.bgUrl;
        const bgStyle = ` style="background-image: url('${escHtml(data.bgUrl)}');"`;        const apply = () => elements.forEach(el => _renderWeatherTile(el, bgStyle));
        if (img.complete) {
          apply();
        } else {
          img.onload = apply;
          img.onerror = apply;
        }
      } else {
        elements.forEach(el => _renderWeatherTile(el, ''));
      }
    } else if (loading) {
      elements.forEach(el => { el.innerHTML = '<div class="weather-nodata">Loading weather\u2026</div>'; });
    } else {
      elements.forEach(el => { el.innerHTML = '<div class="weather-nodata">Set zip code in tile settings</div>'; });
    }
  }

  function schedulePoll() {
    pollTimer = setTimeout(() => {
      localStorage.removeItem(CACHE_KEY);
      fetchData().finally(() => {
        // Self reschedule
        if (pollTimer !== null) schedulePoll();
      });
    }, TTL_MS);
  }

  function start() {
    stop();
    const settings = deps.getSettings();
    if (!settings.weatherZip) return;
    localStorage.removeItem(CACHE_KEY);
    fetchData();
    schedulePoll();
  }

  function stop() {
    if (pollTimer !== null) { clearTimeout(pollTimer); pollTimer = null; }
  }

  function purgeCache() {
    localStorage.removeItem(CACHE_KEY);
  }

  function isRunning() {
    return pollTimer !== null;
  }

  // When the page comes back from being hidden do another fetch if the data is stale
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (pollTimer === null) return;           // polling not active
    if (!navigator.onLine) return;            // can't reach the API
    if (Date.now() - lastFetchTs < TTL_MS) return; // data is still fresh
    localStorage.removeItem(CACHE_KEY);
    fetchData();
  });

  window.WeatherService = {
    TILE_ID,
    CACHE_KEY,
    init,
    fetchData,
    updateFace,
    start,
    stop,
    purgeCache,
    isRunning,
    getData: () => data,
    isLoading: () => loading,
  };
})();
