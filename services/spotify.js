/* ================================================================
   METRO LAUNCHER — Spotify Service
   ----------------------------------------------------------------
   Owns polling of the Leopard status endpoint, the "Test" connection
   check, DOM rendering of the Spotify live tile, and the artist/
   track text cleaners.
   ================================================================ */
/** biome-ignore-all lint/suspicious/noGlobalIsNan: <explanation> */
/** biome-ignore-all lint/correctness/noUnusedVariables: <explanation> */
/** biome-ignore-all lint/complexity/useOptionalChain: <explanation> */
/** biome-ignore-all lint/complexity/useArrowFunction: <explanation> */
/** biome-ignore-all lint/style/useTemplate: <explanation> */
/** biome-ignore-all lint/suspicious/useIterableCallbackReturn: <explanation> */

(function () {
  const TILE_ID = '__spotify__';
  const MIN_INTERVAL_MS = 2000;

  let deps = null;
  let data = null;
  let pollTimer = null;
  let nullCount = 0;

  // Text cleaning regex numero dos

  function cleanArtistName(artist) {
    if (!artist) return '';
    if (deps && deps.getSettings && deps.getSettings().disableRegexCleaning) return artist.trim();
    let parsed = artist.replace(/P!NK/gi, 'PINK');
    parsed = parsed.replace(/(^|\W)\$(?=\w)/g, '$1S');
    parsed = parsed.replace(/\$/g, 's');
    parsed = parsed.replace(/&/g, 'and');
    parsed = parsed.replace(/'/g, '');
    parsed = parsed.replace(/!/g, '');
    parsed = parsed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return parsed;
  }

  // Text cleaning regex numero tres

  function cleanTrackName(track) {
    if (!track) return '';
    if (deps && deps.getSettings && deps.getSettings().disableRegexCleaning) return track.trim();
    
    let parsed = track.replace(/(^|\W)\$(?=\w)/g, '$1S');
    parsed = parsed.replace(/\$/g, 's');
    parsed = parsed.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    parsed = parsed.replace(/&/g, 'and');
    
    // Strip apostrophes early so contractions don't break capitalisation (e.g. She's -> SheS)
    parsed = parsed.replace(/['’]/g, '');

    if (deps && deps.getSettings && deps.getSettings().spotifyCapitaliseSong) {
      parsed = parsed.replace(/\b\w/g, c => c.toUpperCase());
      parsed = parsed.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (m, num, sfx) => num + sfx.toUpperCase());
    }
    
    parsed = parsed.replace(/[“”,.;:+!?^]/g, (match, offset, string) => {
      if (match === '.') {
        const prev = string[offset - 1];
        const next = string[offset + 1];
        if (prev >= '0' && prev <= '9' && next >= '0' && next <= '9') {
          return '.'; // Keep period if between numbers
        }
      }
      return '';
    });
    
    // Aesthetic cleanups
    
    // Remove spaces immediately inside parentheses and brackets
    parsed = parsed.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
    parsed = parsed.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');
    
    // Replace hyphens that are strictly bounded by letters/numbers with a space
    parsed = parsed.replace(/(\w)-(\w)/g, '$1 $2');

    parsed = parsed.replace(/\//g, ' ');
    parsed = parsed.replace(/\bfeat\b/gi, 'Featuring');
    parsed = parsed.replace(/\bwith\b/gi, 'With');
    parsed = parsed.replace(/\bpt\b/gi, 'PT');
    parsed = parsed.replace(/\bvs\b/gi, 'VS');

    return parsed;
  }

  function init(injected) {
    deps = injected;
  }

  // When playback stops we want to keep the old back-face content visible while the tile flips
  const FLIP_MS = 550;

  function handlePlaybackChange(hadData) {
    // snap the tile straight to its front face
    if (hadData && data === null && deps.snapToFront) {
      deps.snapToFront(TILE_ID);
      setTimeout(updateFace, FLIP_MS);
    } else {
      updateFace();
    }
  }

  function fetchData() {
    const settings = deps.getSettings();

    if (!settings.spotifyEnabled) {
      const hadData = data !== null;
      data = null;
      handlePlaybackChange(hadData);
      stop();
      return Promise.resolve();
    }

    // Skip network attempts while offline
    if (!navigator.onLine) return Promise.resolve();

    const tile = deps.getTile(TILE_ID);
    const username = tile?.spotifyUsername || settings.spotifyUsername || '';
    if (!username) return Promise.resolve();

    // Snapshot playback state BEFORE the async call
    const hadDataBefore = data !== null;

    if (!window.MetroRuntime || !window.MetroRuntime.Spotify) return Promise.resolve();

    // Patch fetchStatus to guarantee cache bypass, even if the cached runtime is an older version
    window.MetroRuntime.Spotify.fetchStatus = function(uname) {
      return fetch(`https://leopardindustries.net:8088/metro.php?action=status&username=${encodeURIComponent(uname)}&_ml_reload=${Date.now()}`, { 
        method: 'POST',
        cache: 'no-store' 
      });
    };

    return window.MetroRuntime.Spotify.fetchStatus(username)
      .then(r => r.json())
      .then(d => {
        if (d.isPlaying && (d.track || d.artist)) {
          nullCount = 0;
          let cUrl = null;
          if (d.coverUrl) {
            cUrl = window.MetroRuntime.Spotify.resolveCoverUrl(d.coverUrl);
          }
          const newData = { track: d.track, artist: d.artist, coverUrl: cUrl };
          if (!data || data.track !== newData.track || data.artist !== newData.artist || data.coverUrl !== newData.coverUrl) {
            data = newData;
            handlePlaybackChange(hadDataBefore);
          }
        } else {
          nullCount++;
          if (nullCount >= 2) {
            if (data !== null) {
              data = null;
              handlePlaybackChange(hadDataBefore);
            }
          }
        }
      })
      .catch(() => {
        nullCount++;
        if (nullCount >= 2) {
          if (data !== null) {
            data = null;
            handlePlaybackChange(hadDataBefore);
          }
        }
      });
  }

  function _renderSpotifyTile(el, parsedTrack, parsedArtist, coverUrl, shadeText, unblurArt) {
    const escHtml = deps.escHtml;
    const settings = deps.getSettings();
    const shadeTextClass = shadeText ? ' spotify-text-shade' : '';
    
    let blurEl = el.querySelector('.spotify-bg-blur');
    let trackEl = el.querySelector('.spotify-track');
    let artistEl = el.querySelector('.spotify-artist');
    let wrapperEl = el.querySelector('.spotify-text-wrapper');
    
    if (!blurEl || !trackEl || !artistEl || !wrapperEl) {
      el.innerHTML =
        `<div class="spotify-bg-blur"></div>` +
        `<div class="spotify-text-wrapper${shadeTextClass}">` +
        `<div class="spotify-track"></div>` +
        `<div class="spotify-artist"></div>` +
        `</div>`;
      blurEl = el.querySelector('.spotify-bg-blur');
      trackEl = el.querySelector('.spotify-track');
      artistEl = el.querySelector('.spotify-artist');
      wrapperEl = el.querySelector('.spotify-text-wrapper');
    }
    
    blurEl.className = 'spotify-bg-blur' + (unblurArt ? ' unblurred' : '');
    wrapperEl.className = `spotify-text-wrapper${shadeTextClass}`;
    
    if (coverUrl) {
      blurEl.style.backgroundImage = `url("${coverUrl.replace(/"/g, '\\"')}")`;
    } else {
      blurEl.style.backgroundImage = '';
    }
    
    trackEl.textContent = parsedTrack;
    artistEl.textContent = parsedArtist;
  }

  function updateFace() {
    const escHtml = deps.escHtml;
    const tile = deps.getTile(TILE_ID);
    const showCover = !!tile?.spotifyCoverArt;
    const offline = !navigator.onLine;

    const elements = document.querySelectorAll('.spotify-content');

    if (offline || !data) {
      elements.forEach(el => { el.innerHTML = ''; });
      return;
    }

    const parsedArtist = cleanArtistName(data.artist);
    const parsedTrack = cleanTrackName(data.track);

    const shadeText = !!tile?.spotifyShadeText;
    const unblurArt = !!tile?.spotifyUnblurArt;

    if (showCover && data.coverUrl) {
      // preload the image so the tile doesn't flash without a background
      const img = new Image();
      img.src = data.coverUrl;
      const currentCoverUrl = data.coverUrl;
      const apply = () => elements.forEach(el => _renderSpotifyTile(el, parsedTrack, parsedArtist, currentCoverUrl, shadeText, unblurArt));
      if (img.complete) {
        apply();
      } else {
        img.onload = apply;
        img.onerror = () => {
          if (data && data.coverUrl === currentCoverUrl) {
            data.coverUrl = null;
          }
          elements.forEach(el => _renderSpotifyTile(el, parsedTrack, parsedArtist, null, shadeText, unblurArt));
        };
      }
    } else {
      elements.forEach(el => _renderSpotifyTile(el, parsedTrack, parsedArtist, null, shadeText, unblurArt));
    }
  }

  function start() {
    stop();
    const settings = deps.getSettings();
    if (!settings.spotifyEnabled) return;

    const tile = deps.getTile(TILE_ID);
    let intervalMs = parseInt(tile?.spotifyInterval || settings.spotifyInterval || '2', 10) * 1000;
    if (isNaN(intervalMs) || intervalMs < MIN_INTERVAL_MS) intervalMs = MIN_INTERVAL_MS;

    fetchData();
    pollTimer = setInterval(fetchData, intervalMs);
  }

  function stop() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function testConnection() {
    if (!navigator.onLine) {
      return Promise.resolve({ ok: false, reason: 'offline' });
    }
    
    if (!window.MetroRuntime || !window.MetroRuntime.Spotify) return Promise.resolve({ ok: false, reason: 'uninitialized' });
    return window.MetroRuntime.Spotify.testConnection();
  }

  function isRunning() {
    return pollTimer !== null;
  }

  window.SpotifyService = {
    TILE_ID,
    init,
    fetchData,
    updateFace,
    start,
    stop,
    testConnection,
    isRunning,
    cleanArtistName,
    cleanTrackName,
    getData: () => data,
    hasData: () => data !== null,
  };
})();
