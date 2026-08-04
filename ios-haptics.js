/**
* ios-haptics v3.0.0
* tijn.dev
* @license MIT
**/
let hapticIdCounter = 0;
function e(el) {
  if (!el || el.hasAttribute('data-haptic-id')) return;
  hapticIdCounter++;
  const id = `haptic-switch-${hapticIdCounter}`;
  el.setAttribute('data-haptic-id', id);

  let t = document.createElement('input');
  t.type = 'checkbox';
  t.setAttribute('switch', '');
  t.id = id;

  if (el.classList.contains('tile')) {
    Object.assign(t.style, {
      position: 'absolute', opacity: 0, width: '1px', height: '1px', pointerEvents: 'none', zIndex: -1
    });
    t.tabIndex = -1;
    el.appendChild(t);

    let label = document.createElement('label');
    label.htmlFor = id;
    label.addEventListener('click', ev => ev.stopPropagation());
    Object.assign(label.style, {
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      cursor: 'pointer', margin: 0, padding: 0, zIndex: 1,
      WebkitTapHighlightColor: 'transparent',
      touchAction: 'manipulation'
    });
    el.style.position = 'relative';
    el.insertBefore(label, el.firstChild);
  } else {
    Object.assign(t.style, {
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      margin: 0, opacity: 0, cursor: 'pointer',
      clipPath: 'inset(0 round 999px)', touchAction: 'manipulation'
    });
    t.style.setProperty('-webkit-tap-highlight-color', 'transparent');
    el.style.position = 'relative';
    el.insertAdjacentElement('beforeend', t);
  }
}
export { e as hapticTrigger };
