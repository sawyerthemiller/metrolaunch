/** biome-ignore-all lint/style/useConst: <explanation> */
/** biome-ignore-all lint/correctness/noUnusedFunctionParameters: <explanation> */
/** biome-ignore-all lint/complexity/useArrowFunction: <explanation> */
/** biome-ignore-all lint/suspicious/useIterableCallbackReturn: <explanation> */

(function () {
  const TILE_ID = '__events__';

  let deps = null;
  let pollTimer = null;

  function init(injected) {
    deps = injected;
  }

  function getNextEvents(data) {
    const schedule = data.schedule || {};
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const hideFuture = data.hideFuture === true;

    let allUpcoming = [];
    
    let noRepeatModified = false;
    let remainingNoRepeat = [];
    if (schedule[0]) {
      for (const ev of schedule[0]) {
        const [h, m] = ev.time.split(':').map(Number);
        const evMins = h * 60 + m;
        if (evMins <= currentMins) {
          noRepeatModified = true;
        } else {
          remainingNoRepeat.push(ev);
          allUpcoming.push({ ...ev, minsFromNow: evMins - currentMins });
        }
      }
      if (noRepeatModified) {
        schedule[0] = remainingNoRepeat;
        if (deps.updateTile) deps.updateTile(TILE_ID, { eventsData: data });
      }
    }
    
    // Scan up to 8 days to find the next few events
    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
      if (hideFuture && dayOffset > 0) break;
      
      let checkDay = currentDay + dayOffset;
      if (checkDay > 7) checkDay = checkDay % 7;
      
      const dayEvents = schedule[checkDay] || [];
      for (const ev of dayEvents) {
        const [h, m] = ev.time.split(':').map(Number);
        const evMins = h * 60 + m;
        
        // If it's today, check if it's in the future
        if (dayOffset === 0) {
          if (evMins <= currentMins) continue;
          // No-repeat (day 0) events take priority over regular scheduled events at the same time
          if (schedule[0] && schedule[0].some(e => e.time === ev.time)) continue;
        }
        
        let totalMinsFromNow = (dayOffset * 24 * 60) + evMins - currentMins;
        allUpcoming.push({ ...ev, minsFromNow: totalMinsFromNow });
      }
    }
    
    allUpcoming.sort((a, b) => a.minsFromNow - b.minsFromNow);
    return allUpcoming;
  }

  function formatTime(mins) {
    if (mins < 60) return `Happens in about ${String(mins).padStart(2, '0')} minute${Number(mins) !== 1 ? 's' : ''}`;
    const hrs = Math.round(mins / 60);
    return `Happens in about ${String(hrs).padStart(2, '0')} hour${Number(hrs) !== 1 ? 's' : ''}`;
  }

  function _renderEventsTile(el, alertMins) {
    const escHtml = deps.escHtml;
    const tile = deps.getTile(TILE_ID);
    const data = tile?.eventsData || { alertMins: 20, schedule: {} };
    const alertThreshold = data.alertMins !== undefined ? data.alertMins : 20;

    // Check if empty schedule
    let isEmpty = true;
    for (let i = 0; i <= 7; i++) {
      if (data.schedule[i] && data.schedule[i].length > 0) {
        isEmpty = false; break;
      }
    }

    if (isEmpty) {
      el.innerHTML = `
        <div class="events-center-zone empty">
          <div style="display: flex; align-items: center; justify-content: flex-start; text-align: left; width: 100%;">
            <img src="system_icon/zzz.png" style="width: calc(24px * var(--live-tile-scale, 1)); height: calc(24px * var(--live-tile-scale, 1)); filter: brightness(0) invert(1); margin-right: calc(14px * var(--live-tile-scale, 1)); object-fit: contain; flex-shrink: 0;">
            <span style="font-size: calc(18px * var(--live-tile-scale, 1)); font-weight: 300; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; padding-bottom: 2px;">set up some events...</span>
          </div>
        </div>
      `;
      return;
    }

    const upcoming = getNextEvents(data);
    let nextEvent = upcoming[0];
    let futureEvent = upcoming[1];

    let topHtml = '';
    let centerHtml = '';
    let bottomHtml = '';

    if (!nextEvent) {
      el.innerHTML = `
        <div class="events-center-zone normal">
          <div style="display: flex; align-items: center; justify-content: flex-start; text-align: left; width: 100%;">
            <img src="system_icon/zzz.png" style="width: calc(24px * var(--live-tile-scale, 1)); height: calc(24px * var(--live-tile-scale, 1)); filter: brightness(0) invert(1); margin-right: calc(14px * var(--live-tile-scale, 1)); object-fit: contain; flex-shrink: 0;">
            <span style="font-size: calc(18px * var(--live-tile-scale, 1)); font-weight: 300; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; padding-bottom: 2px;">nothing for now...</span>
          </div>
        </div>
      `;
      return;
    }

    if (nextEvent.minsFromNow <= alertThreshold) {
      // In Alert Zone
      if (futureEvent) {
        topHtml = `
          <div class="events-top">
            <div class="events-top-name">${escHtml(futureEvent.name)}</div>
            <div class="events-top-time">${formatTime(futureEvent.minsFromNow)}</div>
          </div>
        `;
      }
      
      const nameStr = nextEvent.location ? `${escHtml(nextEvent.name)}&nbsp;&nbsp;-&nbsp;&nbsp;${escHtml(nextEvent.location)}` : escHtml(nextEvent.name);

      centerHtml = `
        <div class="events-center-zone alert">
          <div style="display: flex; align-items: center; justify-content: flex-start; text-align: left; width: 100%;">
            <img src="system_icon/walk.png" style="width: calc(34px * var(--live-tile-scale, 1)); height: calc(34px * var(--live-tile-scale, 1)); filter: brightness(0) invert(1); margin-right: calc(12px * var(--live-tile-scale, 1)); object-fit: contain; flex-shrink: 0;">
            <div style="display: flex; flex-direction: column; overflow: hidden; width: 100%;">
              <span style="font-size: calc(22px * var(--live-tile-scale, 1)); font-weight: 300; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: calc(-3px * var(--live-tile-scale, 1)); padding-bottom: 0px;">${String(nextEvent.minsFromNow).padStart(2, '0')} ${nextEvent.minsFromNow === 1 ? 'minute' : 'minutes'}</span>
              <div style="margin-left: 0.5px; font-size: calc(13px * var(--live-tile-scale, 1)); opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 2px;">${nameStr}</div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Not in Alert Zone
      topHtml = `
        <div class="events-top">
          <div class="events-top-name">${escHtml(nextEvent.name)}</div>
          <div class="events-top-time">${formatTime(nextEvent.minsFromNow)}</div>
        </div>
      `;

      centerHtml = `
        <div class="events-center-zone normal">
          <div style="display: flex; align-items: center; justify-content: flex-start; text-align: left; width: 100%;">
            <img src="system_icon/zzz.png" style="width: calc(24px * var(--live-tile-scale, 1)); height: calc(24px * var(--live-tile-scale, 1)); filter: brightness(0) invert(1); margin-right: calc(14px * var(--live-tile-scale, 1)); object-fit: contain; flex-shrink: 0;">
            <span style="font-size: calc(18px * var(--live-tile-scale, 1)); font-weight: 300; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; padding-bottom: 2px;">nothing for now...</span>
          </div>
        </div>
      `;
    }

    el.innerHTML = topHtml + centerHtml + bottomHtml;
  }

  function updateFace() {
    const elements = document.querySelectorAll('.events-back-content');
    elements.forEach(el => _renderEventsTile(el));
  }

  function schedulePoll() {
    pollTimer = setTimeout(() => {
      updateFace();
      if (pollTimer !== null) schedulePoll();
    }, 60000); // 1 minute
  }

  function start() {
    stop();
    updateFace();
    schedulePoll();
  }

  function stop() {
    if (pollTimer !== null) { clearTimeout(pollTimer); pollTimer = null; }
  }

  function isRunning() {
    return pollTimer !== null;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pollTimer !== null) {
      updateFace();
    }
  });

  window.EventsService = {
    TILE_ID,
    init,
    updateFace,
    start,
    stop,
    isRunning,
  };
})();
