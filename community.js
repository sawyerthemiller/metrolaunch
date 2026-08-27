// community.js
/** biome-ignore-all lint/style/useTemplate: <explanation> */
/** biome-ignore-all lint/complexity/useOptionalChain: <explanation> */
/** biome-ignore-all lint/suspicious/noGlobalIsNan: <explanation> */
/** biome-ignore-all lint/correctness/noUnusedVariables: <explanation> */
/** biome-ignore-all lint/correctness/noUnusedFunctionParameters: <explanation> */
/** biome-ignore-all lint/complexity/useArrowFunction: <explanation> */
/** biome-ignore-all lint/security/noGlobalEval: <explanation> */
// Handles all Community Hub features (Unique Users & Custom Tile Submissions)

window.communityAPI = {
  initCommunity: function(callback) {
    // Check if we need to cast a pending vote
    if (localStorage.getItem('metrolaunch_community_vote_pending') === '1') {
      communityAPI.castUniqueUserVote(true);
    }

    if (localStorage.getItem('metrolaunch_community_seen') !== '1' || localStorage.getItem('metrolaunch_backend_consent') === null) {
      // Show privacy modal on first boot or if consent is undecided
      communityAPI.showPrivacyModal(true, callback);
    } else {
      // Already seen, proceed
      if (callback) callback();
    }
  },

  castUniqueUserVote: async function(isRetry = false) {
    if (localStorage.getItem('metrolaunch_community_unique_user') !== '1') return;
    
    try {
      if (!window.MetroRuntime || !window.MetroRuntime.Community) throw new Error("Uninitialized");
      const res = await window.MetroRuntime.Community.castVote();
      if (!res.ok) throw new Error('Server error');
      // Success, remove pending flag if any
      localStorage.removeItem('metrolaunch_community_vote_pending');
    } catch (e) {
      localStorage.setItem('metrolaunch_community_vote_pending', '1');
      if (window.showToast) {
        window.showToast('Leopard server down - trying later');
      }
    }
  },

  showPrivacyModal: function(isFirstBoot, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    
    const isConsentChecked = localStorage.getItem('metrolaunch_backend_consent') === '1';
    const isUniqueChecked = localStorage.getItem('metrolaunch_community_unique_user') === '1';
    const isSubmitChecked = localStorage.getItem('metrolaunch_community_submit') !== '0'; // default true if not set, or false if 0
    
    // Once the unique check is done, it's permanently greyed out.
    const uniqueDisabled = isUniqueChecked ? 'opacity: 0.5; pointer-events: none;' : '';

    overlay.innerHTML = `
      <div class="confirm-box" style="width: 100%; max-width: 400px; padding: 20px; text-align: left;">
        <h3 style="text-align: center;">Community Settings</h3>
        <p style="margin-bottom: 20px; text-align: center;">Please configure your community preferences...</p>
        
        <div class="form-group" style="display:flex; align-items:flex-start; margin-bottom:15px; cursor:pointer;" id="comm-toggle-consent">
          <div class="metro-checkbox ${isConsentChecked ? 'checked' : ''}" style="margin-right:12px; margin-top: 4px; flex-shrink: 0;"></div>
          <div style="text-align: left; transform: translateY(-2px);">
            <div style="font-weight:600; font-size:15px;">Consent to usage of launcher data backend</div>
            <div style="font-size:12px; opacity:0.7;">for the privacy and safety of users and the server - spotify integration, user counts, alternate news sources, and the community app library have been moved to a closed-source backend system - read more in the GH repo</div>
          </div>
        </div>

        <div class="form-group" style="display:flex; align-items:flex-start; margin-bottom:15px; cursor:pointer; ${uniqueDisabled}" id="comm-toggle-unique">
          <div class="metro-checkbox ${isUniqueChecked ? 'checked' : ''}" style="margin-right:12px; margin-top: 4px; flex-shrink: 0;"></div>
          <div style="text-align: left; transform: translateY(-2px);">
            <div style="font-weight:600; font-size:15px;">Enables a single unique user count</div>
            <div style="font-size:12px; opacity:0.7;">this helps me measure how much i should work on it and contains no identifying information</div>
          </div>
        </div>
        
        <div class="form-group" style="display:flex; align-items:flex-start; margin-bottom:20px; cursor:pointer;" id="comm-toggle-submit">
          <div class="metro-checkbox ${isSubmitChecked ? 'checked' : ''}" style="margin-right:12px; margin-top: 4px; flex-shrink: 0;"></div>
          <div style="text-align: left; transform: translateY(-2px);">
            <div style="font-weight:600; font-size:15px;">Enables the submit button on custom tiles</div>
            <div style="font-size:12px; opacity:0.7;">shows only in search menu - help people add more apps and cut out the confusion</div>
          </div>
        </div>

        <div class="confirm-actions" style="display:flex; gap:10px; margin-top:20px;">
          <button id="comm-init-btn" style="flex: 1; font-size:14px; padding:12px 0; border: 1px solid var(--accent, #0078d4); background: transparent; color: var(--text);">Setup Networking</button>
          <button id="comm-ok-btn" style="color:#fff; border-color:var(--accent, #0078d4); flex: 1; padding:12px 0;">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const btnConsent = overlay.querySelector('#comm-toggle-consent');
    const chkConsent = btnConsent.querySelector('.metro-checkbox');
    const btnUnique = overlay.querySelector('#comm-toggle-unique');
    const chkUnique = btnUnique.querySelector('.metro-checkbox');
    const btnSubmit = overlay.querySelector('#comm-toggle-submit');
    const chkSubmit = btnSubmit.querySelector('.metro-checkbox');
    
    const initBtn = overlay.querySelector('#comm-init-btn');
    const okBtn = overlay.querySelector('#comm-ok-btn');

    let hasInitialized = isConsentChecked;

    const updateBtnStates = () => {
      const consentOn = chkConsent.classList.contains('checked');
      if (consentOn) {
        if (!hasInitialized) {
          initBtn.style.opacity = '1';
          initBtn.style.pointerEvents = 'auto';
          initBtn.disabled = false;
          okBtn.style.opacity = '0.5';
          okBtn.style.pointerEvents = 'none';
          okBtn.disabled = true;
        } else {
          initBtn.style.opacity = '0.5';
          initBtn.style.pointerEvents = 'none';
          initBtn.disabled = true;
          initBtn.textContent = 'Already Done';
          okBtn.style.opacity = '1';
          okBtn.style.pointerEvents = 'auto';
          okBtn.disabled = false;
        }
        
        btnUnique.style.opacity = isUniqueChecked ? '0.5' : '1';
        btnUnique.style.pointerEvents = isUniqueChecked ? 'none' : 'auto';
        btnSubmit.style.opacity = '1';
        btnSubmit.style.pointerEvents = 'auto';
      } else {
        initBtn.style.opacity = '0.5';
        initBtn.style.pointerEvents = 'none';
        initBtn.disabled = true;
        okBtn.style.opacity = '1';
        okBtn.style.pointerEvents = 'auto';
        okBtn.disabled = false;
        
        btnUnique.style.opacity = '0.5';
        btnUnique.style.pointerEvents = 'none';
        btnSubmit.style.opacity = '0.5';
        btnSubmit.style.pointerEvents = 'none';
      }
    };

    btnConsent.onclick = () => {
      chkConsent.classList.toggle('checked');
      if (!chkConsent.classList.contains('checked')) {
        hasInitialized = false;
        initBtn.textContent = 'Setup Networking';
      }
      updateBtnStates();
    };

    initBtn.onclick = async () => {
      initBtn.textContent = 'Working...';
      initBtn.style.pointerEvents = 'none';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch('https://leopardindustries.net:8088/metro.php?action=runtime', { 
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error();
        const js = await res.text();
        localStorage.setItem('metrolaunch_runtime_js', js);
        hasInitialized = true;
        updateBtnStates();
      } catch (e) {
        clearTimeout(timeoutId);
        initBtn.textContent = 'Failed...';
        chkConsent.classList.remove('checked');
        hasInitialized = false;
        updateBtnStates();
        
        if (window.showToast) {
          const toastEl = document.getElementById('toast');
          if (toastEl) {
            const oldZ = toastEl.style.zIndex;
            toastEl.style.zIndex = '100005';
            window.showToast('Server could not respond - please try later');
            setTimeout(() => {
              if (toastEl.style.zIndex === '100005') toastEl.style.zIndex = oldZ;
            }, 3000);
          } else {
            window.showToast('Server could not respond - please try later');
          }
        }
        
        setTimeout(() => {
          initBtn.textContent = 'Setup Networking';
          updateBtnStates();
        }, 2000);
      }
    };

    if (!isUniqueChecked) {
      btnUnique.onclick = () => {
        chkUnique.classList.toggle('checked');
      };
    } else {
      btnUnique.style.opacity = '0.5';
      btnUnique.style.pointerEvents = 'none';
    }

    btnSubmit.onclick = () => {
      chkSubmit.classList.toggle('checked');
    };

    updateBtnStates();

    okBtn.onclick = () => {
      const consentOn = chkConsent.classList.contains('checked');
      const uniqueOn = chkUnique.classList.contains('checked');
      const submitOn = chkSubmit.classList.contains('checked');
      
      const wasConsentOn = isConsentChecked;

      if (!consentOn) {
        localStorage.setItem('metrolaunch_backend_consent', '0');
        localStorage.removeItem('metrolaunch_runtime_js');
        if (window.App && window.App.updateTile) {
          if (window.NewsService) {
            window.App.updateTile(window.NewsService.TILE_ID, { newsProvider: 'hn', customRssUrl: '' });
          }
          if (window.SpotifyService) {
            window.App.updateTile(window.SpotifyService.TILE_ID, { spotifyUsername: '' });
          }
          if (window.App.getSettings && window.App.saveSettings) {
            const settings = window.App.getSettings();
            settings.spotifyUsername = '';
            window.App.saveSettings();
          }
        }
        if (window.NewsService) {
          window.NewsService.purgeCache();
          window.NewsService.fetchData();
        }
      } else {
        localStorage.setItem('metrolaunch_backend_consent', '1');
      }

      // Only attempt networking if consent is actually on
      if (consentOn && uniqueOn && !isUniqueChecked) {
        localStorage.setItem('metrolaunch_community_unique_user', '1');
        communityAPI.castUniqueUserVote(false);
      }

      localStorage.setItem('metrolaunch_community_submit', submitOn ? '1' : '0');
      localStorage.setItem('metrolaunch_community_seen', '1');
      
      overlay.remove();
      if (callback) callback();
      
      // Force reload if consent state changed to prevent partial state bugs
      if (wasConsentOn !== consentOn) {
        const overlayBg = document.createElement('div');
        overlayBg.style.position = 'fixed';
        overlayBg.style.bottom = '0';
        overlayBg.style.left = '0';
        overlayBg.style.width = '100vw';
        overlayBg.style.height = '0';
        overlayBg.style.backgroundColor = '#000';
        overlayBg.style.zIndex = '999999';
        overlayBg.style.transition = 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
        overlayBg.style.display = 'flex';
        overlayBg.style.flexDirection = 'column';
        overlayBg.style.alignItems = 'center';
        overlayBg.style.justifyContent = 'center';
        overlayBg.style.overflow = 'hidden';
        document.body.appendChild(overlayBg);

        const textEl = document.createElement('div');
        textEl.textContent = 'The launcher will soon reload...';
        textEl.style.color = '#fff';
        textEl.style.fontSize = '18px';
        textEl.style.fontWeight = '300';
        textEl.style.marginBottom = '40px';
        textEl.style.opacity = '0';
        textEl.style.transition = 'opacity 0.4s ease';
        textEl.style.textAlign = 'center';
        overlayBg.appendChild(textEl);

        const dotsContainer = document.createElement('div');
        dotsContainer.style.position = 'relative';
        dotsContainer.style.width = '0px';
        dotsContainer.style.height = '8px';
        overlayBg.appendChild(dotsContainer);

        let dotColor = 'var(--accent, #0078d4)';
        try {
          const rawSet = localStorage.getItem('metro_launcher_settings');
          if (rawSet) {
            const parsedSet = JSON.parse(rawSet);
            if (parsedSet.globalColorEnabled && parsedSet.globalColor) {
              dotColor = parsedSet.globalColor;
            }
          }
        } catch(e) {}

        const styleEl = document.createElement('style');
        styleEl.textContent = `
          @keyframes customLoaderFly {
            0% { transform: translateX(-60vw); opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { transform: translateX(60vw); opacity: 0; }
          }
          .loading-dot-square {
            position: absolute;
            left: -4px;
            width: 8px;
            height: 8px;
            background-color: ${dotColor};
            opacity: 0;
            animation: customLoaderFly 1.8s cubic-bezier(0.1, 0.5, 0.9, 0.5) forwards;
          }
        `;
        document.head.appendChild(styleEl);

        for (let i = 0; i < 10; i++) {
          const dot = document.createElement('div');
          dot.className = 'loading-dot-square';
          dot.style.animationDelay = (0.2 + i * 0.06) + 's';
          dotsContainer.appendChild(dot);
        }

        requestAnimationFrame(() => {
          overlayBg.style.height = '100vh';
          // Delay text fade in slightly
          setTimeout(() => textEl.style.opacity = '1', 200);
        });

        // Fade out text before reload
        setTimeout(() => {
          textEl.style.opacity = '0';
        }, 2200);

        setTimeout(() => {
          location.reload();
        }, 2600);
      }
    };
  },

  isSubmitEnabled: function() {
    return localStorage.getItem('metrolaunch_community_submit') === '1';
  },

  submitApp: async function(appData) {
    try {
      if (!window.MetroRuntime || !window.MetroRuntime.Community) throw new Error("Uninitialized");
      const res = await window.MetroRuntime.Community.submitApp(appData);
      if (res.status === 409) {
        if (window.showToast) window.showToast('That app has already been submitted');
        return false;
      }
      if (res.status === 429) {
        if (window.showToast) window.showToast('Server is in cooldown period');
        return false;
      }
      if (res.status === 400 || res.status === 413) {
        if (window.showToast) window.showToast('App breaks rules for community submission');
        return false;
      }
      if (!res.ok) throw new Error('Server error');
      if (window.showToast) window.showToast('App submitted to community :)');
      return true;
    } catch (e) {
      if (window.showToast) window.showToast('Leopard server down - please retry later');
      return false;
    }
  },

  showUserAppsModal: async function() {
    // Show Fetching Data holdover modal
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.style.zIndex = '3000';
    overlay.innerHTML = `
      <div class="confirm-box" style="width: 100%; max-width: 400px; display: flex; flex-direction: column; height: 80vh; max-height: 600px; padding: 0;">
        <div style="padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin:0; font-weight:300; font-size:20px;">User Apps</h2>
          <div style="display:flex; align-items: center; border: 1.5px solid var(--text); border-radius: 0;">
            <button id="comm-refresh-btn" style="background:transparent; border:none; width: 40px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text); padding: 0; box-sizing: border-box;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            </button>
            <div style="width: 1.5px; height: 32px; background-color: var(--text);"></div>
            <button id="comm-close-btn" style="background:transparent; border:none; width: 40px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color:var(--text); padding: 0; box-sizing: border-box;">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div id="comm-apps-list" class="scrollable-y" style="flex: 1; overflow-y: auto; overflow-x: hidden; padding: 20px; position: relative;">
          <div id="comm-loading" style="display:flex; justify-content:center; align-items:center; height:100%; font-size: 18px; opacity: 0.7;">Fetching data...</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);

    overlay.querySelector('#comm-close-btn').onclick = () => overlay.remove();
    
    const consent = localStorage.getItem('metrolaunch_backend_consent') === '1';
    const runtimeReady = !!window.MetroRuntime;
    
    if (window.applyHaptics) {
      const allBtns = Array.from(overlay.querySelectorAll('button'));
      const refreshBtn = overlay.querySelector('#comm-refresh-btn');
      const btnsToHaptic = (consent && runtimeReady) ? allBtns : allBtns.filter(b => b !== refreshBtn);
      window.applyHaptics(btnsToHaptic);
    }
    
    const listContainer = overlay.querySelector('#comm-apps-list');
    const loading = overlay.querySelector('#comm-loading');
    
    // Add local HTML escape helper since the main one might not be in scope
    const esc = (str) => String(str).replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag])
    );
    
    const loadData = async () => {
      loading.textContent = 'Fetching Data...';
      loading.style.display = 'flex';
      Array.from(listContainer.children).forEach(c => {
        if (c.id !== 'comm-loading') c.remove();
      });
      
      // Use the already-defined consent and runtimeReady variables
      if (!consent || !runtimeReady) {
        loading.textContent = consent && !runtimeReady 
          ? 'Backend was not recieved...'
          : 'This feature requires consent in advanced settings...';
        return;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      
      try {
        if (!window.MetroRuntime || !window.MetroRuntime.Community) throw new Error("Uninitialized");
        const res = await window.MetroRuntime.Community.listApps({
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Server error');
        const data = await res.json();
        loading.style.display = 'none';
        
        if (!data.apps || data.apps.length === 0) {
          const div = document.createElement('div');
          div.style.textAlign = 'center';
          div.style.opacity = '0.5';
          div.style.marginTop = '20px';
          div.textContent = 'no apps available...';
          listContainer.appendChild(div);
          return;
        }

        const formatAppDate = (dateStr) => {
          if (!dateStr) return 'unknown date';
          try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const yy = String(d.getFullYear()).slice(-2);
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yy} - ${mm} - ${dd}`;
          } catch(e) {
            return dateStr;
          }
        };

        data.apps.sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach((app, index, arr) => {
          const item = document.createElement('div');
          item.style.display = 'flex';
          item.style.justifyContent = 'space-between';
          item.style.alignItems = 'center';
          item.style.padding = '12px 0';
          item.style.borderBottom = index === arr.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)';
          item.dataset.id = app.id;
          
          item.innerHTML = `
            <div style="text-align: left;">
              <div style="font-weight: 600; font-size: 16px; letter-spacing: 0.5px;">${esc((app.name || '').toLowerCase())}</div>
              <div style="font-size: 12px; opacity: 0.5;">${esc(formatAppDate(app.date))}</div>
            </div>
            <button class="comm-get-btn" style="background: #000; color: #fff; border: 1px solid #fff; border-radius: 0; padding: 6px 14px; font-weight: 600; font-size: 14px; cursor: pointer; font-family: 'Segoe UI Supro', sans-serif;">GET</button>
          `;

          // Swipe to delete logic
          let startX = 0;
          let startY = 0;
          let isScrolling = false;
          let isSwiping = false;

          item.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isScrolling = false;
            isSwiping = false;
            item.style.transition = 'none';
          });
          item.addEventListener('touchmove', (e) => {
            if (isScrolling) return;
            const diffX = e.touches[0].clientX - startX;
            const diffY = e.touches[0].clientY - startY;

            if (!isSwiping) {
              if (Math.abs(diffY) > 10) {
                isScrolling = true;
                return;
              }
              if (Math.abs(diffX) > 10) {
                isSwiping = true;
              }
            }

            if (isSwiping && diffX > 0) {
              const maxTranslate = item.offsetWidth * 0.25;
              const translateX = Math.min(diffX, maxTranslate);
              item.style.transform = `translateX(${translateX}px)`;
              if (e.cancelable) e.preventDefault();
            }
          });
          item.addEventListener('touchend', (e) => {
            item.style.transition = 'transform 0.3s ease';
            item.style.transform = 'translateX(0)';
            if (isScrolling) return;

            const endX = e.changedTouches[0].clientX;
            const maxTranslate = item.offsetWidth * 0.25;
            if (endX - startX > maxTranslate * 0.8) { // Swiped right far enough
              communityAPI.showAdminDeleteModal(app.id, overlay);
            }
          });

          // Also allow mouse dragging for testing
          let mStartX = 0;
          let mDown = false;
          item.addEventListener('mousedown', (e) => {
            mStartX = e.clientX;
            mDown = true;
            item.style.transition = 'none';
          });
          item.addEventListener('mousemove', (e) => {
            if (!mDown) return;
            const diffX = e.clientX - mStartX;
            if (diffX > 0) {
              const maxTranslate = item.offsetWidth * 0.25;
              const translateX = Math.min(diffX, maxTranslate);
              item.style.transform = `translateX(${translateX}px)`;
            }
          });
          item.addEventListener('mouseup', (e) => {
            if (!mDown) return;
            mDown = false;
            item.style.transition = 'transform 0.3s ease';
            item.style.transform = 'translateX(0)';

            const endX = e.clientX;
            const maxTranslate = item.offsetWidth * 0.25;
            if (endX - mStartX > maxTranslate * 0.8) {
              communityAPI.showAdminDeleteModal(app.id, overlay);
            }
          });
          item.addEventListener('mouseleave', () => {
            if (mDown) {
              mDown = false;
              item.style.transition = 'transform 0.3s ease';
              item.style.transform = 'translateX(0)';
            }
          });
          
          // GET button logic
          item.querySelector('.comm-get-btn').onclick = (e) => {
            e.stopPropagation();
            if (window.App && window.App.getFlatTiles) {
              const duplicate = window.App.getFlatTiles().find(t => {
                if (t.name && t.name.toLowerCase() === (app.name || '').toLowerCase()) return true;
                if (app.launchUrl && t.url && t.url.toLowerCase() === app.launchUrl.toLowerCase()) return true;
                return false;
              });
              
              if (duplicate) {
                if (window.showToast) window.showToast('Cannot install duplicate app');
                return;
              }
            }
            if (window.App && window.App.addTile) {
              window.App.addTile({
                type: 'app',
                name: app.name, // the case they were submitted in
                url: app.launchUrl,
                icon: app.iconUrl,
                color: app.color,
                size: 'small'
              });
              if (window.showToast) window.showToast(`Was added to your tiles...`);
            }
          };
          
          listContainer.appendChild(item);
        });
        if (window.applyHaptics) window.applyHaptics(Array.from(listContainer.querySelectorAll('.comm-get-btn')));
      } catch (e) {
        clearTimeout(timeoutId);
        const consent = localStorage.getItem('metrolaunch_backend_consent') === '1';
        loading.textContent = consent ? 'Server appears to be down...' : 'This feature requires consent in advanced settings...';
        loading.style.display = 'flex';
      }
    };

    overlay.querySelector('#comm-refresh-btn').onclick = loadData;
    
    // Initial load
    loadData();
  },

  showAdminDeleteModal: function(appId, parentOverlay) {
    const adminModal = document.createElement('div');
    adminModal.className = 'confirm-overlay';
    adminModal.style.zIndex = '3001';
    
    adminModal.innerHTML = `
      <div class="confirm-box" style="width: 280px; text-align: center;">
        <h3>Administrator Access</h3>
        <p>Enter 4-digit code to delete...</p>
        <div style="display:flex; justify-content:center; gap: 10px; margin: 20px 0;">
          <input type="tel" inputmode="numeric" pattern="[0-9]*" class="admin-digit" maxlength="2" style="width: 40px; height: 50px; text-align: center; font-size: 24px; background: transparent; border: 2px solid var(--border); color: var(--text); border-radius: 0; outline: none;">
          <input type="tel" inputmode="numeric" pattern="[0-9]*" class="admin-digit" maxlength="2" style="width: 40px; height: 50px; text-align: center; font-size: 24px; background: transparent; border: 2px solid var(--border); color: var(--text); border-radius: 0; outline: none;">
          <input type="tel" inputmode="numeric" pattern="[0-9]*" class="admin-digit" maxlength="2" style="width: 40px; height: 50px; text-align: center; font-size: 24px; background: transparent; border: 2px solid var(--border); color: var(--text); border-radius: 0; outline: none;">
          <input type="tel" inputmode="numeric" pattern="[0-9]*" class="admin-digit" maxlength="2" style="width: 40px; height: 50px; text-align: center; font-size: 24px; background: transparent; border: 2px solid var(--border); color: var(--text); border-radius: 0; outline: none;">
        </div>
        <div class="confirm-actions">
          <button class="confirm-cancel">Cancel</button>
          <button class="confirm-ok" id="admin-ok-btn" style="color:#fff; border-color:var(--accent, #0078d4);">OK</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(adminModal);
    
    const inputs = Array.from(adminModal.querySelectorAll('.admin-digit'));
    
    inputs.forEach((inp, idx) => {
      inp.addEventListener('focus', () => {
        inp.select();
      });
      inp.addEventListener('input', () => {
        if (inp.value && inp.value !== '•') {
          inp.dataset.val = inp.value.slice(-1);
          inp.value = '•';
        } else if (!inp.value) {
          inp.dataset.val = '';
        }
        if (inp.value && idx < inputs.length - 1) inputs[idx + 1].focus();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) {
          inputs[idx - 1].focus();
        }
      });
    });
    
    setTimeout(() => inputs[0].focus(), 100);

    adminModal.querySelector('.confirm-cancel').onclick = () => {
      adminModal.remove();
    };

    adminModal.querySelector('#admin-ok-btn').onclick = async () => {
      const code = inputs.map(i => i.dataset.val || '').join('');
      if (code.length !== 4) return;
      
      try {
        if (!window.MetroRuntime || !window.MetroRuntime.Community) throw new Error("Uninitialized");
        const res = await window.MetroRuntime.Community.deleteApp(appId, code);
        
        if (res.status === 429) {
          if (window.showToast) window.showToast('Server is in cooldown period');
          adminModal.remove();
          return;
        }
        
        if (res.status === 401) {
          if (window.showToast) window.showToast('Invalid administrator code');
          adminModal.remove();
          return;
        }
        if (!res.ok) throw new Error('Server error');
        
        if (window.showToast) window.showToast('App deleted from server...');
        adminModal.remove();
        
        // Refresh the list
        const refreshBtn = parentOverlay.querySelector('#comm-refresh-btn');
        if (refreshBtn) refreshBtn.click();
      } catch (e) {
        if (window.showToast) window.showToast('Leopard server down - please retry later');
        adminModal.remove();
      }
    };
  }
};
