const TILE_SIZES = {
  small: { cols: 1, rows: 1 },
  medium: { cols: 2, rows: 2 },
  wide: { cols: 4, rows: 2 },
};

function overlaps(a, b) {
  const sa = TILE_SIZES[a.size], sb = TILE_SIZES[b.size];
  return !(a.col + sa.cols <= b.col || b.col + sb.cols <= a.col ||
    a.row + sa.rows <= b.row || b.row + sb.rows <= a.row);
}

let tiles = [
  { id: 'w', size: 'wide', col: 0, row: 0, visibility: 'visible' },
  { id: 'm', size: 'medium', col: 0, row: 1, visibility: 'visible' },
  { id: 's', size: 'small', col: 0, row: 0, visibility: 'visible' }
];

function pushTilesAway(changedId, skipId, ignoreFolders = false) {
    const changed = tiles.find(t => t.id === changedId);
    if (!changed) return;
    let moved = true;
    let iterations = 0;
    while (moved && iterations < 100) {
      moved = false;
      iterations++;
      for (const t of tiles) {
        if (t.id === changedId || t.id === skipId || t.visibility === 'search') continue;
        if (overlaps(changed, t)) {
          const sc = TILE_SIZES[changed.size];
          t.row = changed.row + sc.rows;
          moved = true;
        }
      }
      if (moved) {
        for (let i = 0; i < tiles.length; i++) {
          for (let j = i + 1; j < tiles.length; j++) {
            if (tiles[i].visibility === 'search' || tiles[j].visibility === 'search') continue;
            if (overlaps(tiles[i], tiles[j])) {
              let top = tiles[i];
              let bottom = tiles[j];
              
              if (bottom.id === changedId) {
                top = tiles[j];
                bottom = tiles[i];
              } else if (top.id === changedId) {
                // keep top as changedId
              } else if (bottom.row < top.row || (bottom.row === top.row && bottom.col < top.col)) {
                top = tiles[j];
                bottom = tiles[i];
              }
              
              const stop = TILE_SIZES[top.size];
              bottom.row = top.row + stop.rows;
              moved = true;
            }
          }
        }
      }
    }
}

pushTilesAway('w', null);
console.log(tiles);
