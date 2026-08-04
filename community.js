// community.js
// Handles all Community Hub features (Unique Users & Custom Tile Submissions)

window.communityAPI = {
  initCommunity: function(callback) {
    // Check if we need to cast a pending vote
    if (localStorage.getItem('metrolaunch_community_vote_pending') === '1') {
      communityAPI.castUniqueUserVote(true);
    }

    if (localStorage.getItem('metrolaunch_community_seen') !== '1') {
      // Show privacy modal on first boot
      communityAPI.showPrivacyModal(true, callback);
    } else {
      // Already seen, proceed
      if (callback) callback();
    }
  },

  castUniqueUserVote: async function(isRetry = false) {
    if (localStorage.getItem('metrolaunch_community_unique_user') !== '1') return;
    
    try {
      const res = await fetch('https://leopardindustries.net:8088/?action=vote', { method: 'POST' });
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
    
    const isUniqueChecked = localStorage.getItem('metrolaunch_community_unique_user') === '1';
    const isSubmitChecked = localStorage.getItem('metrolaunch_community_submit') !== '0'; // default true if not set, or false if 0
    
    // Once the unique check is done, it's permanently greyed out.
    const uniqueDisabled = isUniqueChecked ? 'opacity: 0.5; pointer-events: none;' : '';

    overlay.innerHTML = `
      <div class="confirm-box" style="width: 320px;">
        <h3>Community Settings</h3>
        <p style="margin-bottom: 20px;">Please configure your community preferences...</p>
        
        <div class="form-group" style="display:flex; align-items:flex-start; margin-bottom:15px; cursor:pointer;" id="comm-toggle-unique" style="${uniqueDisabled}">
          <div class="metro-checkbox ${isUniqueChecked ? 'checked' : ''}" style="margin-right:12px; margin-top: 4px;"></div>
          <div>
            <div style="font-weight:600; font-size:16px;">Enable a single unique user count</div>
            <div style="font-size:13px; opacity:0.7;">this helps me measure how much i should work on it and contains no identifying information</div>
          </div>
        </div>
        
        <div class="form-group" style="display:flex; align-items:flex-start; margin-bottom:20px; cursor:pointer;" id="comm-toggle-submit">
          <div class="metro-checkbox ${isSubmitChecked ? 'checked' : ''}" style="margin-right:12px; margin-top: 4px;"></div>
          <div>
            <div style="font-weight:600; font-size:16px;">Enable the submit button on custom tiles</div>
            <div style="font-size:13px; opacity:0.7;">help people add more apps and cut out the confusion</div>
          </div>
        </div>

        <div class="confirm-actions">
          <button class="confirm-danger" style="color:#fff; border-color:var(--accent, #0078d4); flex: 1;">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const btnUnique = overlay.querySelector('#comm-toggle-unique');
    const chkUnique = btnUnique.querySelector('.metro-checkbox');
    const btnSubmit = overlay.querySelector('#comm-toggle-submit');
    const chkSubmit = btnSubmit.querySelector('.metro-checkbox');

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

    overlay.querySelector('.confirm-danger').onclick = () => {
      const uniqueOn = chkUnique.classList.contains('checked');
      const submitOn = chkSubmit.classList.contains('checked');

      if (uniqueOn && !isUniqueChecked) {
        localStorage.setItem('metrolaunch_community_unique_user', '1');
        communityAPI.castUniqueUserVote(false);
      }

      localStorage.setItem('metrolaunch_community_submit', submitOn ? '1' : '0');
      localStorage.setItem('metrolaunch_community_seen', '1');
      
      overlay.remove();
      if (callback) callback();
    };
  },

  isSubmitEnabled: function() {
    return localStorage.getItem('metrolaunch_community_submit') === '1';
  },

  submitApp: async function(appData) {
    try {
      const res = await fetch('https://leopardindustries.net:8088/?action=submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appData)
      });
      if (res.status === 409) {
        if (window.showToast) window.showToast('That app has already been submitted');
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
      <div class="confirm-box" style="width: 320px; display: flex; flex-direction: column; height: 80vh; max-height: 600px; padding: 0;">
        <div style="padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin:0;">User Apps</h3>
          <div style="display:flex; gap: 10px; align-items: center;">
            <button id="comm-refresh-btn" style="background:transparent; border:2px solid var(--text); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text); padding: 0; box-sizing: border-box;">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            </button>
            <button id="comm-close-btn" style="background:transparent; border:2px solid var(--text); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; color:var(--text); padding: 0; box-sizing: border-box;">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div id="comm-apps-list" style="flex: 1; overflow-y: auto; padding: 20px; position: relative;">
          <div id="comm-loading" style="display:flex; justify-content:center; align-items:center; height:100%; font-size: 18px; opacity: 0.7;">Fetching Data...</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);

    overlay.querySelector('#comm-close-btn').onclick = () => overlay.remove();
    
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
      loading.style.display = 'flex';
      Array.from(listContainer.children).forEach(c => {
        if (c.id !== 'comm-loading') c.remove();
      });
      
      try {
        const res = await fetch('https://leopardindustries.net:8088/?action=list');
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

        data.apps.forEach(app => {
          const item = document.createElement('div');
          item.style.display = 'flex';
          item.style.justifyContent = 'space-between';
          item.style.alignItems = 'center';
          item.style.padding = '12px 0';
          item.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
          item.dataset.id = app.id;
          
          item.innerHTML = `
            <div style="text-align: left;">
              <div style="font-weight: 600; font-size: 16px;">${esc((app.name || '').toLowerCase())}</div>
              <div style="font-size: 12px; opacity: 0.5;">${esc(app.date || 'Unknown date')}</div>
            </div>
            <button class="comm-get-btn" style="background: #000; color: #fff; border: 2px solid #fff; border-radius: 0; padding: 6px 14px; font-weight: 600; font-size: 14px; cursor: pointer; font-family: 'Segoe UI Supro', sans-serif;">GET</button>
          `;

          // Swipe to delete logic
          let startX = 0;
          item.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
          });
          item.addEventListener('touchend', (e) => {
            const endX = e.changedTouches[0].clientX;
            if (endX - startX > 80) { // Swiped right
              communityAPI.showAdminDeleteModal(app.id, overlay);
            }
          });

          // Also allow mouse dragging for testing
          let mStartX = 0;
          let mDown = false;
          item.addEventListener('mousedown', (e) => { mStartX = e.clientX; mDown = true; });
          item.addEventListener('mouseup', (e) => {
            if (!mDown) return;
            mDown = false;
            const endX = e.clientX;
            if (endX - mStartX > 80) {
              communityAPI.showAdminDeleteModal(app.id, overlay);
            }
          });
          
          // GET button logic
          item.querySelector('.comm-get-btn').onclick = (e) => {
            e.stopPropagation();
            if (window.App) {
              const installedNames = window.App.getTiles().map(t => (t.name || '').toLowerCase());
              if (installedNames.includes((app.name || '').toLowerCase())) {
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
      } catch (e) {
        loading.textContent = 'no apps available...';
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
          <input type="password" inputmode="numeric" pattern="[0-9]*" class="admin-digit" maxlength="1" style="width: 40px; height: 50px; text-align: center; font-size: 24px; background: transparent; border: 2px solid var(--border); color: var(--text); border-radius: 0; outline: none;">
          <input type="password" inputmode="numeric" pattern="[0-9]*" class="admin-digit" maxlength="1" style="width: 40px; height: 50px; text-align: center; font-size: 24px; background: transparent; border: 2px solid var(--border); color: var(--text); border-radius: 0; outline: none;">
          <input type="password" inputmode="numeric" pattern="[0-9]*" class="admin-digit" maxlength="1" style="width: 40px; height: 50px; text-align: center; font-size: 24px; background: transparent; border: 2px solid var(--border); color: var(--text); border-radius: 0; outline: none;">
          <input type="password" inputmode="numeric" pattern="[0-9]*" class="admin-digit" maxlength="1" style="width: 40px; height: 50px; text-align: center; font-size: 24px; background: transparent; border: 2px solid var(--border); color: var(--text); border-radius: 0; outline: none;">
        </div>
        <div class="confirm-actions">
          <button class="confirm-cancel">Cancel</button>
          <button class="confirm-danger" id="admin-ok-btn" style="color:#fff; border-color:var(--accent, #0078d4);">OK</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(adminModal);
    
    const inputs = Array.from(adminModal.querySelectorAll('.admin-digit'));
    
    inputs.forEach((inp, idx) => {
      inp.addEventListener('input', () => {
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
      const code = inputs.map(i => i.value).join('');
      if (code.length !== 4) return;
      
      try {
        const res = await fetch('https://leopardindustries.net:8088/?action=delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: appId, admin_code: code })
        });
        
        if (res.status === 401) {
          if (window.showToast) window.showToast('Invalid administrator code');
          adminModal.remove();
          return;
        }
        if (!res.ok) throw new Error('Server error');
        
        if (window.showToast) window.showToast('App deleted from server.');
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
