document.addEventListener('DOMContentLoaded', () => {
  // Wait for App to be ready
  setTimeout(initSearch, 100);
});

let isSearchOpen = false;
let currentSearchQuery = '';

function initSearch() {
  const searchBtns = document.querySelectorAll('.nav-normal-icons img[src="navbar_icon/search.png"]');
  const backBtns = document.querySelectorAll('.nav-normal-icons img[src="navbar_icon/back.png"]');
  const searchInputs = document.querySelectorAll('.search-input');
  const advancedIconBtns = document.querySelectorAll('#btn-advanced-icon, #btn-advanced-icon-mobile');
  
  advancedIconBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.App && window.App.showAdvancedIconControl) {
        window.App.showAdvancedIconControl();
      }
    });
  });
  
  document.addEventListener('tilesUpdated', renderSearchList);
  
  searchBtns.forEach(btn => {
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', openSearch);
  });
  
  backBtns.forEach(btn => {
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', closeSearch);
  });
  
  searchInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase();
      renderSearchList();
    });
  });
}

function openSearch() {
  if (isSearchOpen) return;
  isSearchOpen = true;
  
  // Snap live tiles back to normal face
  if (window.App && window.App.flipTile) {
    document.querySelectorAll('.live-tile .live-tile-inner').forEach(inner => {
      window.App.flipTile(inner, false);
    });
  }
  
  // Close ellipsis menu
  document.querySelectorAll('.header-menu').forEach(m => m.classList.remove('open'));
  
  // Change header text and hide buttons
  const titleText = (window.App && window.App.getSettings().headerTitle) || 'Hello';
  document.querySelectorAll('.header h1').forEach(el => {
    // Store original text
    el.dataset.origText = el.textContent;
    el.textContent = 'Search';
  });
  
  document.querySelectorAll('.header-actions > *:not(.search-actions)').forEach(el => {
    el.style.display = 'none';
  });
  
  document.querySelectorAll('.search-actions').forEach(el => {
    el.style.display = 'flex';
  });
  
  // Animate pages container
  document.querySelectorAll('.pages-container').forEach(container => {
    container.classList.add('show-search');
  });
  
  // Clear inputs and re-render
  currentSearchQuery = '';
  document.querySelectorAll('.search-input').forEach(input => input.value = '');
  renderSearchList();
}

function closeSearch() {
  if (!isSearchOpen) return;
  isSearchOpen = false;
  
  // Restore header text and buttons
  document.querySelectorAll('.header h1').forEach(el => {
    if (el.dataset.origText) {
      el.textContent = el.dataset.origText;
    }
  });
  
  document.querySelectorAll('.header-actions > *:not(.search-actions)').forEach(el => {
    el.style.display = '';
  });
  
  document.querySelectorAll('.search-actions').forEach(el => {
    el.style.display = 'none';
  });
  
  // Animate back
  document.querySelectorAll('.pages-container').forEach(container => {
    container.classList.remove('show-search');
  });
}

function renderSearchList() {
  if (!window.App) return;
  
  const tiles = window.App.getFlatTiles ? window.App.getFlatTiles() : window.App.getTiles();
  const settings = window.App.getSettings();
  
  // Group tiles by first letter
  const groups = {};
  
  tiles.forEach(tile => {
    if (!tile.name) return;
    if (tile.visibility === 'tiles') return;
    
    const nameStr = tile.name.trim();
    if (!nameStr) return;
    
    // Filter by search query
    if (currentSearchQuery && !nameStr.toLowerCase().includes(currentSearchQuery)) return;
    
    let firstLetter = nameStr.charAt(0).toUpperCase();
    if (!/[A-Z]/.test(firstLetter)) {
      firstLetter = '#';
    }
    
    if (!groups[firstLetter]) groups[firstLetter] = [];
    groups[firstLetter].push(tile);
  });
  
  // Sort letters
  const sortedLetters = Object.keys(groups).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });
  
  // Generate HTML
  const isHideIcons = !!settings.hideSearchIcons;
  const isGlobalColor = !!settings.globalColorEnabled;
  const globalColor = settings.globalColor || '#0078D7';
  
  let html = '';
  
  sortedLetters.forEach(letter => {
    html += `
      <div class="search-group">
        <div class="search-group-letter">${letter}</div>
        <hr class="search-group-divider">
    `;
    
    // Sort tiles within the group
    groups[letter].sort((a, b) => a.name.localeCompare(b.name)).forEach(tile => {
      const bgColor = isGlobalColor ? globalColor : (tile.color || '#0078D7');
      html += `
        <div class="search-item" data-id="${tile.id}">
      `;
      
      if (!isHideIcons) {
        let iconHtml = '';
        if (window.App && window.App.getTileIconHtml) {
          iconHtml = window.App.getTileIconHtml(tile);
        } else {
          iconHtml = `<img src="${escapeHtml(tile.icon)}" alt="">`;
        }
        
        html += `
          <div class="search-item-tile" style="background-color: ${bgColor};">
            ${iconHtml}
          </div>
        `;
      }
      
      html += `
          <div class="search-item-name">${escapeHtml(tile.name)}</div>
        </div>
      `;
    });
    
    html += `</div>`;
  });
  
  // Inject into containers
  document.querySelectorAll('.search-results').forEach(container => {
    if (isHideIcons) {
      container.classList.add('hide-icons');
    } else {
      container.classList.remove('hide-icons');
    }
    container.innerHTML = html;
    
    // Add click and long-press listeners to items
    const items = container.querySelectorAll('.search-item');
    items.forEach(item => {
      let longPressTimer;
      let isLongPress = false;
      let startX = 0;
      let startY = 0;
      
      const clearTimer = () => clearTimeout(longPressTimer);
      
      item.addEventListener('touchstart', (e) => {
        isLongPress = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        longPressTimer = setTimeout(() => {
          isLongPress = true;
          const id = item.getAttribute('data-id');
          showSearchContextMenu(id, startX, startY);
        }, 600);
      }, {passive: true});
      
      item.addEventListener('touchmove', (e) => {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 10 || dy > 10) clearTimer();
      }, {passive: true});
      
      item.addEventListener('touchend', (e) => {
        clearTimer();
        if (isLongPress) {
          e.preventDefault(); // Prevent click if we handled long press
        }
      });
      
      // Desktop right click
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const id = item.getAttribute('data-id');
        showSearchContextMenu(id, e.clientX, e.clientY);
      });
      
      item.addEventListener('click', (e) => {
        if (isLongPress) {
          isLongPress = false;
          return;
        }
        const id = item.getAttribute('data-id');
        const tile = tiles.find(t => t.id === id);
        if (tile && window.App && window.App.launchApp) {
          window.App.launchApp(tile);
        }
      });
    });
  });
}

function showSearchContextMenu(tileId, x, y) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  const tile = window.App ? window.App.getTiles().find(t => t.id === tileId) : null;
  if (!tile) return;
  
  const DEFAULT_APP_NAMES = ['weather', 'messages', 'chrome', 'maps', 'mail', 'camera', 'settings', 'photos', 'music', 'youtube'];
  const isDefaultApp = DEFAULT_APP_NAMES.includes((tile.name || '').toLowerCase());
  
  let submitHtml = '';
  if (window.communityAPI && window.communityAPI.isSubmitEnabled() && !isDefaultApp) {
    submitHtml = `
      <div class="context-menu-item" data-action="submit">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-right:8px;"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg> Community Submit
      </div>
      <div class="context-menu-divider"></div>
    `;
  }
  
  menu.innerHTML = `
    ${submitHtml}
    <div class="context-menu-item danger" data-action="delete">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> Remove
    </div>
  `;
  
  menu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 100)}px`;
  menu.classList.add('visible');
  
  menu.onclick = (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item) return;
    const action = item.dataset.action;
    menu.classList.remove('visible');
    
    if (action === 'delete') {
      if (window.App && window.App.deleteTile) {
        window.App.deleteTile(tileId);
        renderSearchList();
      }
    } else if (action === 'submit') {
      const tileUrl = tile.url || tile.launchUrl || '';
      if (tileUrl.toLowerCase().startsWith('livecontainer://')) {
        if (window.showToast) window.showToast('Not allowed for community submission');
      } else if (window.communityAPI) {
        window.communityAPI.submitApp({
          name: tile.name,
          iconUrl: tile.icon || '',
          color: tile.color || '#0078d4',
          launchUrl: tileUrl
        });
      }
    }
  };
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
