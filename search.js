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
  
  document.querySelectorAll('.header-actions').forEach(el => {
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
  
  document.querySelectorAll('.header-actions').forEach(el => {
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
  
  const tiles = window.App.getTiles();
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
    
    // Add click listeners to items
    const items = container.querySelectorAll('.search-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        const tile = tiles.find(t => t.id === id);
        if (tile && window.App.launchApp) {
          window.App.launchApp(tile);
        }
      });
    });
  });
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
