/* ================================================================
   METRO LAUNCHER — Spotify Service
   ----------------------------------------------------------------
   Owns polling of the Leopard status endpoint, the "Test" connection
   check, DOM rendering of the Spotify live tile, and the artist/
   track text cleaners.
   ================================================================ */

(function () {
  const TILE_ID = '__spotify__';
  const SERVER_URL = 'https://leopardindustries.net:8088/spotify.php';
  const MIN_INTERVAL_MS = 2000;

  let deps = null;
  let data = null;
  let pollTimer = null;
  let nullCount = 0;

  // Text cleaning regex numero dos

  function cleanArtistName(artist) {
    if (!artist) return '';
    let parsed = artist.replace(/P!NK/gi, 'PINK');
    parsed = parsed.replace(/(^|\W)\$(?=\w)/g, '$1S');
    parsed = parsed.replace(/\$/g, 's');
    parsed = parsed.replace(/'/g, '');
    parsed = parsed.replace(/!/g, '');
    return parsed;
  }

  // Text cleaning regex numero tres

  function cleanTrackName(track) {
    if (!track) return '';
    let parsed = track.replace(/(^|\W)\$(?=\w)/g, '$1S');
    parsed = parsed.replace(/\$/g, 's');
    
    parsed = parsed.replace(/['’“”,.;:+!?]/g, (match, offset, string) => {
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

    const url = `${SERVER_URL}?action=status&username=${encodeURIComponent(username)}&t=${Date.now()}`;

    // Snapshot playback state BEFORE the async call
    const hadDataBefore = data !== null;

    return fetch(url, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.isPlaying) {
          nullCount = 0;
          let cUrl = null;
          if (d.coverUrl) {
            if (d.coverUrl.startsWith('http')) {
              cUrl = d.coverUrl;
            } else {
              // coverUrl is a relative path
              const urlObj = new URL(SERVER_URL);
              const basePath = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
              cUrl = `${urlObj.origin}${basePath}${d.coverUrl.replace(/^\//, '')}`;
            }
          }
          data = { track: d.track, artist: d.artist, coverUrl: cUrl };
          handlePlaybackChange(hadDataBefore);
        } else {
          nullCount++;
          if (nullCount >= 2) {
            data = null;
            handlePlaybackChange(hadDataBefore);
          }
        }
      })
      .catch(() => {
        nullCount++;
        if (nullCount >= 2) {
          data = null;
          handlePlaybackChange(hadDataBefore);
        }
      });
  }

  function _renderSpotifyTile(el, parsedTrack, parsedArtist, bgStyle) {
    const escHtml = deps.escHtml;
    el.innerHTML =
      `<div class="spotify-bg-blur"${bgStyle}></div>` +
      `<div class="spotify-track">${escHtml(parsedTrack)}</div>` +
      `<div class="spotify-artist">${escHtml(parsedArtist)}</div>`;
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

    if (showCover && data.coverUrl) {
      // preload the image so the tile doesn't flash without a background
      const img = new Image();
      img.src = data.coverUrl;
      const bgStyle = ` style="background-image: url('${escHtml(data.coverUrl)}');"`;      const apply = () => elements.forEach(el => _renderSpotifyTile(el, parsedTrack, parsedArtist, bgStyle));
      if (img.complete) {
        apply();
      } else {
        img.onload = apply;
        img.onerror = apply;  // still render the tile, just without the image
      }
    } else {
      elements.forEach(el => _renderSpotifyTile(el, parsedTrack, parsedArtist, ''));
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

  /**
   * Simple reachability check for the Leopard server
   */
  function testConnection() {
    if (!navigator.onLine) {
      return Promise.resolve({ ok: false, reason: 'offline' });
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    return fetch(`${SERVER_URL}?t=${Date.now()}`, { 
      cache: 'no-store',
      signal: controller.signal
    })
      .then(resp => {
        clearTimeout(timeoutId);
        return resp.ok ? { ok: true } : { ok: false, reason: `status-${resp.status}` };
      })
      .catch(err => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') return { ok: false, reason: 'timeout' };
        return { ok: false, reason: 'network' };
      });
  }

  function isRunning() {
    return pollTimer !== null;
  }

  window.SpotifyService = {
    TILE_ID,
    SERVER_URL,
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
