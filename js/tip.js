/* Sheep Genetics Sandbox: tooltips.
 *
 * Every title attribute on the page shows as a styled tooltip, quickly on
 * mouse hover or keyboard focus, in place of the browser's slow native one
 * (which some browsers and previews never show). Hints with nothing else to
 * click, and anything marked data-tip-toggle, also open on click or tap, so
 * touch screens can read them. A click while one shows, or Escape, hides it
 * until the pointer or focus leaves.
 */
(function () {
  'use strict';

  const DELAY = 400;
  // Clicking these does something, so a click there closes the tooltip instead.
  const INTERACTIVE = 'button, a, input, select, textarea, label, summary, [role="button"], [role="checkbox"], [data-open], [data-act]';

  const tip = document.createElement('div');
  tip.className = 'tip-pop';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');

  let host = null;       // the element whose tooltip shows
  let pinned = false;    // opened by a click: stays until the next click
  let suppressed = null; // hidden by a click or Escape: stays hidden until left
  let pending = null;
  let timer = 0;
  let lastHidden = 0;
  // Where the mouse is, and where it was when a click or Escape last hid a
  // tooltip. Until it moves from there, a page redrawn under it doesn't
  // bring a tooltip back.
  let pointer = { x: -1, y: -1 };
  let quietAt = null;

  // Move a title into data-tip so the native tooltip doesn't show as well.
  // Screen readers keep the text, as a label when there's nothing else to
  // read and as a description otherwise.
  function adopt(el) {
    const text = el.getAttribute('title');
    if (text !== null) {
      el.removeAttribute('title');
      el.dataset.tip = text;
      if (el.dataset.tipLabel || (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !el.textContent.trim())) {
        el.setAttribute('aria-label', text);
        el.dataset.tipLabel = '1';
      } else if (el.getAttribute('aria-label') !== text) {
        el.setAttribute('aria-description', text);
      }
    }
    return el.dataset.tip ? el : null;
  }

  function hostOf(target) {
    const el = target && target.closest ? target.closest('[title], [data-tip]') : null;
    return el && adopt(el);
  }

  const toggles = el => el.hasAttribute('data-tip-toggle') || !el.closest(INTERACTIVE);

  // Below the element, or above it when there's no room below; inside the window.
  function place() {
    const r = host.getBoundingClientRect();
    const m = 8;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const x = Math.max(m, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - m));
    let y = r.bottom + 6;
    if (y + h > window.innerHeight - m && r.top - 6 - h >= m) y = r.top - 6 - h;
    tip.style.left = Math.round(x) + 'px';
    tip.style.top = Math.round(y) + 'px';
  }

  function show(el) {
    cancel();
    host = el;
    suppressed = null;
    tip.textContent = el.dataset.tip;
    tip.classList.add('show');
    place();
  }

  function hide() {
    cancel();
    if (host) lastHidden = Date.now();
    host = null;
    pinned = false;
    tip.classList.remove('show');
  }

  function cancel() {
    clearTimeout(timer);
    pending = null;
  }

  function quiet(e) {
    quietAt = e && e.detail ? { x: e.clientX, y: e.clientY } : pointer;
  }

  function onPointerMove(e) {
    pointer = { x: e.clientX, y: e.clientY };
    if (!quietAt || (pointer.x === quietAt.x && pointer.y === quietAt.y)) return;
    // The pointer enters an element before it moves, so look again now.
    quietAt = null;
    if (e.pointerType !== 'touch') hover(e.target);
  }

  function onPointerOver(e) {
    if (e.pointerType !== 'touch' && !quietAt) hover(e.target);
  }

  function hover(target) {
    if (pinned) return;
    const el = hostOf(target);
    if (!el || el === host || el === pending || el === suppressed) return;
    cancel();
    // Moving from one tooltip straight to the next shows it at once.
    const warm = host || Date.now() - lastHidden < 300;
    if (host) hide();
    pending = el;
    timer = setTimeout(() => show(el), warm ? 0 : DELAY);
  }

  function onPointerOut(e) {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    if (el === suppressed) suppressed = null;
    if (el === pending) cancel();
    if (el === host && !pinned && !el.matches(':focus-visible')) hide();
  }

  function onFocusIn(e) {
    const el = hostOf(e.target);
    if (el && el === e.target && el !== suppressed && el.matches(':focus-visible')) show(el);
  }

  function onFocusOut(e) {
    if (e.target === suppressed) suppressed = null;
    if (e.target === host && !pinned && !host.matches(':hover')) hide();
  }

  function onClick(e) {
    const el = hostOf(e.target);
    if (el && toggles(el)) {
      if (el === host) { hide(); suppressed = el; quiet(e); } else { show(el); pinned = true; }
      return;
    }
    hide();
    quiet(e);
    if (el) suppressed = el;
  }

  function onKeydown(e) {
    if (e.key !== 'Escape' || !host) return;
    // A tooltip the player opened takes the Escape; one that popped up under
    // a resting mouse closes but lets it through.
    const opened = pinned || host.matches(':focus-visible');
    suppressed = host;
    hide();
    quiet();
    if (opened) e.stopImmediatePropagation();
  }

  function onScroll() {
    if (!host) return;
    if (pinned) place(); else hide();
  }

  function init() {
    document.body.appendChild(tip);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', hide);
    // A re-render can replace the element under the tooltip.
    new MutationObserver(() => { if (host && !host.isConnected) hide(); })
      .observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
