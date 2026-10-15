/* Sheep Genetics Sandbox: flock history.
 *
 * How the flock has changed: fleece generation by generation, and the
 * breeding flock's diversity and each litter's inbreeding, litter by
 * litter. It reads only what the player can see anyway: measured fleece,
 * pedigrees and litters.
 */
(function () {
  'use strict';

  const E = window.SheepEngine;
  const D = window.SheepDisplay;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = v => Math.round(v * 1000) / 10 + '%';
  const one = v => (Math.round(v * 10) / 10).toFixed(1);
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
  const breeding = n => n + ' breeding sheep';
  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

  // Better and worse, for the line under each fleece chart.
  const WORDS = {
    diameter: ['finer', 'coarser'],
    staple: ['longer', 'shorter'],
    crimp: ['crimpier', 'less crimpy'],
    luster: ['more lustrous', 'less lustrous'],
  };

  let flock = null;
  let openSheep = null;
  let root = null;
  let data = null;
  let width = 0;
  let hides = []; // each chart's tooltip, closed by a tap anywhere else

  // ------------------------------------------------------------ data

  function collect() {
    const sheep = flock.list();
    const gens = [];
    for (const r of sheep) (gens[r.gen] = gens[r.gen] || []).push(r);
    for (let g = 0; g < gens.length; g++) gens[g] = gens[g] || [];
    const history = flock.diversityHistory();
    return { sheep, gens, history, litters: history.filter(p => p.kind === 'litter') };
  }

  const nameOf = id => { const r = flock.get(id); return r ? r.name : 'unknown'; };
  const pairText = p => esc(nameOf(p.sire)) + ' × ' + esc(nameOf(p.dam));
  const retired = r => flock.breedingsLeft(r.id) === 0;

  function genAverages(valueOf) {
    return data.gens.map((list, g) => (list.length ? { g, v: mean(list.map(valueOf)), n: list.length } : null)).filter(Boolean);
  }

  // ---------------------------------------------------------- scales

  function niceStep(span, target) {
    const raw = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
  }

  function niceRange(min, max, target) {
    if (max - min < 1e-9) { min -= Math.abs(min) * 0.1 || 1; max += Math.abs(max) * 0.1 || 1; }
    const step = niceStep(max - min, target);
    return { lo: Math.floor(min / step + 1e-9) * step, hi: Math.ceil(max / step - 1e-9) * step, step };
  }

  // Multiples of step from lo to hi.
  function tickValues(lo, hi, step) {
    const out = [];
    for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) out.push(k * step);
    return out;
  }

  const pctTick = step => v => (step >= 0.01 ? Math.round(v * 100) : Math.round(v * 1000) / 10) + '%';

  // A deterministic nudge in [-1, 1], so a sheep's dot doesn't jump between draws.
  function jitter(id) {
    let h = 2166136261;
    for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return ((h >>> 0) % 2001) / 1000 - 1;
  }

  const line = (cls, x1, y1, x2, y2) => '<line class="' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
  const text = (cls, x, y, anchor, body) => '<text class="' + cls + '" x="' + x + '" y="' + y + '" text-anchor="' + anchor + '">' + body + '</text>';
  const pathOf = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');

  // Horizontal gridlines with their labels on the left.
  function yAxis(ticks, py, x0, x1, label) {
    return ticks.map(v => line('hc-grid', x0, py(v), x1, py(v)) + text('hc-tick', x0 - 8, py(v) + 4, 'end', label(v))).join('');
  }

  // ---------------------------------------------------------- tooltips

  // One tooltip per chart. Mouse: hover shows, click opens the sheep. Touch:
  // a tap shows, a second tap on the same point opens it.
  function hookTip(wrap, find, html, place, pick) {
    const svg = wrap.querySelector('svg');
    const tip = wrap.querySelector('.chart-tip');
    let active = null;
    let tapped = null;
    let pointerType = 'mouse';

    function at(e) {
      const box = svg.getBoundingClientRect();
      return find(e.clientX - box.left, e.clientY - box.top);
    }
    function show(hit, e) {
      if (!hit) { hide(); return; }
      active = hit;
      place(hit, true);
      tip.innerHTML = html(hit) + (pick && hit.id && pointerType !== 'mouse' ? '<div class="tt-hint">Tap again to open</div>' : '');
      tip.hidden = false;
      const box = svg.getBoundingClientRect();
      const wb = wrap.getBoundingClientRect();
      const x = hit.x + box.left - wb.left;
      const y = (hit.tipY !== undefined ? hit.tipY : e.clientY - box.top) + box.top - wb.top;
      const left = x + 14 + tip.offsetWidth > wb.width ? x - 14 - tip.offsetWidth : x + 14;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = Math.max(0, y - tip.offsetHeight - 8) + 'px';
      svg.style.cursor = pick && hit.id ? 'pointer' : '';
    }
    function hide() {
      if (active) place(active, false);
      active = null;
      tip.hidden = true;
      svg.style.cursor = '';
    }
    svg.onpointerdown = e => {
      pointerType = e.pointerType;
      if (pointerType === 'mouse') return;
      tapped = active;
      show(at(e), e);
    };
    svg.onpointermove = e => { if (e.pointerType === 'mouse' || active) show(at(e), e); };
    svg.onpointerleave = e => { if (e.pointerType === 'mouse') hide(); };
    svg.onclick = () => {
      if (!pick || !active || !active.id) return;
      if (pointerType === 'mouse' || (tapped && tapped.id === active.id)) pick(active.id);
    };
    hides.push(hide);
  }

  // ---------------------------------------------------- fleece charts

  function drawFleece(wrap, t) {
    const W = wrap.clientWidth;
    const H = 210;
    const m = { l: 40, r: 40, t: 10, b: 38 };
    const G = data.gens.length;
    const bw = (W - m.l - m.r) / G;
    const cx = g => m.l + bw * (g + 0.5);
    const value = r => r.phenotype.fleece[t.key];
    const { lo, hi, step } = niceRange(Math.min(...data.sheep.map(value)), Math.max(...data.sheep.map(value)), 4);
    const py = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);
    const spread = Math.min(bw * 0.3, 24);
    const dots = data.sheep.map((r, i) => ({ i, id: r.id, r, v: value(r), x: cx(r.gen) + jitter(r.id) * spread, y: py(value(r)) }));
    const avgs = genAverages(value).map((a, i) => Object.assign(a, { i, x: cx(a.g), y: py(a.v) }));

    // Generation labels, thinned out when there are too many to fit.
    const every = Math.max(1, Math.ceil(G / Math.max(1, Math.floor((W - m.l - m.r) / 26))));
    let svg = yAxis(tickValues(lo, hi, step), py, m.l, W - m.r, v => +v.toFixed(step < 1 ? 1 : 0)) +
      line('hc-axis', m.l, H - m.b, W - m.r, H - m.b);
    for (let g = 0; g < G; g += every) svg += text('hc-tick', cx(g), H - m.b + 16, 'middle', g);
    svg += text('hc-tick', (m.l + W - m.r) / 2, H - 4, 'middle', 'Generation');
    svg += dots.map((d, i) => '<circle class="hc-dot" data-i="' + i + '" cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) + '" r="3.5"/>').join('');
    svg += '<path class="hc-line" d="' + pathOf(avgs.map(a => [a.x, a.y])) + '"/>';
    svg += avgs.map((a, i) => '<circle class="hc-avg" data-a="' + i + '" cx="' + a.x + '" cy="' + a.y.toFixed(1) + '" r="4.5"/>').join('');
    const last = avgs[avgs.length - 1];
    svg += text('hc-end', last.x + 9, last.y + 4, 'start', one(last.v));

    const el = wrap.querySelector('svg');
    el.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    el.setAttribute('height', H);
    el.innerHTML = svg;
    el.setAttribute('aria-label', t.name + ' by generation. ' + fleeceNote(t, avgs));

    const find = (x, y) => {
      let best = null;
      let bestD = 16 * 16;
      for (const a of avgs) {
        const d = (a.x - x) ** 2 + (a.y - y) ** 2 - 30;
        if (d < bestD) { bestD = d; best = a; }
      }
      for (const d of dots) {
        const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
        if (dd < bestD) { bestD = dd; best = d; }
      }
      return best && Object.assign({ tipY: best.y }, best);
    };
    const html = h => (h.r
      ? '<b>' + one(h.v) + ' ' + esc(t.unit) + '</b><br>' + D.swatch(h.r.phenotype, 'xs') + ' ' + esc(h.r.name) + ' ' + D.sexIcon(h.r.sex) +
        ' <span>· gen ' + h.r.gen + (retired(h.r) ? ' · retired' : '') + '</span>'
      : '<b>' + one(h.v) + ' ' + esc(t.unit) + '</b> average<br><span>' + (h.g ? 'Generation ' + h.g : 'Founders') + ' · ' + h.n + ' sheep</span>');
    const place = (h, on) => {
      const mark = el.querySelector(h.r ? '[data-i="' + h.i + '"]' : '[data-a="' + h.i + '"]');
      if (!mark) return;
      mark.classList.toggle('on', on);
      if (h.r) mark.setAttribute('r', on ? 5 : 3.5);
    };
    hookTip(wrap, find, html, place, openSheep);
  }

  function fleeceNote(t, avgs) {
    if (avgs.length < 2) return 'Only founders so far.';
    const first = avgs[0];
    const last = avgs[avgs.length - 1];
    const d = last.v - first.v;
    const [better, worse] = WORDS[t.key];
    const word = Math.abs(d) < 0.1 * t.sd ? 'about the same as' : (d * t.worseDir < 0 ? better : worse) + ' than';
    return 'Generation ' + last.g + ' averages ' + one(last.v) + ' ' + t.unit + ', ' + word + ' the founders\' ' + one(first.v) + '.';
  }

  // ------------------------------------------------ the litter chart

  // Two panels on one litter axis: the breeding flock's diversity, and the
  // inbreeding of each litter's lambs.
  function drawLitters(wrap) {
    const W = wrap.clientWidth;
    const pts = data.history;
    const N = pts.length;
    const m = { l: 44, r: 52, t: 26, b: 38 };
    const top = [m.t, m.t + 130];
    const bot = [top[1] + 52, top[1] + 52 + 110];
    const H = bot[1] + m.b;
    const px = i => m.l + i / (N - 1) * (W - m.l - m.r);

    // Diversity runs from a little below its lowest point (90% at most) to 100%.
    const floor = Math.min(0.9, Math.min(...pts.filter(p => p.value !== null).map(p => p.value)) - 0.01);
    const dstep = niceStep(1 - floor, 2);
    const dlo = Math.floor(floor / dstep + 1e-9) * dstep;
    const dy = v => top[1] - (v - dlo) / (1 - dlo) * (top[1] - top[0]);
    const maxF = Math.max(0, ...data.litters.map(p => p.inbreeding));
    const f = niceRange(0, Math.max(0.125, maxF), 3);
    const fy = v => bot[1] - v / f.hi * (bot[1] - bot[0]);

    let svg = text('hc-title', m.l, top[0] - 12, 'start', 'Diversity of the breeding flock') +
      yAxis(tickValues(dlo, 1, dstep), dy, m.l, W - m.r, pctTick(dstep)) +
      text('hc-title', m.l, bot[0] - 12, 'start', 'Inbreeding of each litter') +
      yAxis(tickValues(0, f.hi, f.step), fy, m.l, W - m.r, pctTick(f.step)) +
      line('hc-axis', m.l, bot[1], W - m.r, bot[1]);

    // Litter numbers along the bottom, between "start" and "now".
    const L = data.litters.length;
    const room = Math.max(1, Math.floor((W - m.l - m.r) / 34) - 2);
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => L / s <= room) || 1000;
    svg += text('hc-tick', px(0), bot[1] + 16, 'middle', 'start') + text('hc-tick', px(N - 1), bot[1] + 16, 'middle', 'now');
    for (let k = step; k <= L; k += step) {
      if (px(k) - px(0) > 30 && px(N - 1) - px(k) > 26) svg += text('hc-tick', px(k), bot[1] + 16, 'middle', k);
    }
    svg += text('hc-tick', (m.l + W - m.r) / 2, H - 4, 'middle', 'Litter');

    const run = pts.map((p, i) => (p.value === null ? null : [px(i), dy(p.value)])).filter(Boolean);
    svg += '<path class="hc-line" d="' + pathOf(run) + '"/>';
    const now = pts[N - 1];
    if (now.value !== null) {
      svg += '<circle class="hc-avg" cx="' + px(N - 1) + '" cy="' + dy(now.value) + '" r="4.5"/>' +
        text('hc-end', px(N - 1) + 9, dy(now.value) + 4, 'start', pct(now.value));
    }
    svg += pts.map((p, i) => (p.kind === 'litter'
      ? '<circle class="hc-dot" data-i="' + i + '" cx="' + px(i).toFixed(1) + '" cy="' + fy(p.inbreeding).toFixed(1) + '" r="3.5"/>' : '')).join('');
    svg += '<g class="hc-hover" hidden>' + line('hc-cross', 0, top[0] - 4, 0, bot[1]) +
      '<circle class="hc-ring" r="5"/><circle class="hc-ring hc-ring-f" r="5"/></g>';

    const el = wrap.querySelector('svg');
    el.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    el.setAttribute('height', H);
    el.innerHTML = svg;
    el.setAttribute('aria-label', litterNote().replace(/<[^>]+>/g, ''));

    const find = x => {
      const i = Math.max(0, Math.min(N - 1, Math.round((x - m.l) / (W - m.l - m.r) * (N - 1))));
      return Object.assign({ i, x: px(i) }, pts[i]);
    };
    const html = p => {
      const div = p.value === null ? 'too few sheep to measure' : '<b>' + pct(p.value) + '</b> diversity';
      if (p.kind !== 'litter') return '<b>' + (p.kind === 'start' ? 'Start' : 'Now') + '</b><br>' + div + ' <span>· ' + breeding(p.breeders) + '</span>';
      const lambs = p.lambs.map(nameOf);
      return '<b>Litter ' + p.litter + '</b> <span>· ' + pairText(p) + '</span><br>' +
        '<b>' + pct(p.inbreeding) + '</b> inbred lambs <span>· ' + (lambs.length ? esc(lambs.join(', ')) : 'none born') + '</span><br>' +
        div + ' after <span>· ' + breeding(p.breeders) + '</span>';
    };
    const hover = el.querySelector('.hc-hover');
    const place = (p, on) => {
      hover.toggleAttribute('hidden', !on);
      if (!on) return;
      hover.querySelector('.hc-cross').setAttribute('x1', p.x);
      hover.querySelector('.hc-cross').setAttribute('x2', p.x);
      const [ring, ringF] = hover.querySelectorAll('.hc-ring');
      ring.toggleAttribute('hidden', p.value === null);
      if (p.value !== null) { ring.setAttribute('cx', p.x); ring.setAttribute('cy', dy(p.value)); }
      ringF.toggleAttribute('hidden', p.kind !== 'litter');
      if (p.kind === 'litter') { ringF.setAttribute('cx', p.x); ringF.setAttribute('cy', fy(p.inbreeding)); }
    };
    hookTip(wrap, find, html, place, null);
  }

  function litterNote() {
    const L = data.litters;
    const start = data.history.find(p => p.value !== null);
    const now = data.history[data.history.length - 1];
    let s = start && now.value !== null
      ? 'Diversity went from ' + pct(start.value) + ' at the start to <b>' + pct(now.value) + '</b> now, over ' + plural(L.length, 'litter') + '. '
      : '';
    const related = L.filter(p => p.inbreeding > 0);
    if (!related.length) return s + 'Every pair you\'ve bred was unrelated, so no lambs are inbred yet.';
    const worst = related.reduce((a, b) => (b.inbreeding > a.inbreeding ? b : a));
    s += related.length + ' of them ' + (related.length === 1 ? 'was' : 'were') + ' between relatives. The closest was ' +
      pairText(worst) + ' (litter ' + worst.litter + '), whose lambs are ' + pct(worst.inbreeding) + ' inbred.';
    return s;
  }

  // ------------------------------------------------------------ tables

  function fleeceTable() {
    return '<table class="data"><thead><tr><th>Generation</th><th>Sheep</th>' +
      E.TRAITS.map(t => '<th>' + t.name + ' <span class="muted">' + esc(t.unit) + '</span></th>').join('') + '<th>Inbreeding</th></tr></thead><tbody>' +
      data.gens.map((list, g) => (list.length ? '<tr><th>' + (g ? g : '0 (founders)') + '</th><td>' + list.length + '</td>' +
        E.TRAITS.map(t => '<td>' + one(mean(list.map(r => r.phenotype.fleece[t.key]))) + '</td>').join('') +
        '<td>' + pct(mean(list.map(r => r.inbreeding || 0))) + '</td></tr>' : '')).join('') +
      '</tbody></table>';
  }

  function litterTable() {
    const who = id => '<button class="link" data-open="' + id + '">' + esc(nameOf(id)) + '</button>';
    const div = p => (p.value === null ? '—' : pct(p.value));
    return '<table class="data"><thead><tr><th>Litter</th><th>Parents</th><th>Lambs</th><th>Inbreeding</th><th>Diversity after</th><th>Breeding sheep</th></tr></thead><tbody>' +
      data.history.map(p => (p.kind === 'litter'
        ? '<tr><th>' + p.litter + '</th><td>' + who(p.sire) + ' × ' + who(p.dam) + '</td><td>' +
          (p.lambs.length ? p.lambs.map(who).join(', ') : '<span class="muted">none born</span>') + '</td><td>' + pct(p.inbreeding) + '</td>'
        : '<tr><th>' + (p.kind === 'start' ? 'Start' : 'Now') + '</th><td></td><td></td><td></td>') +
        '<td>' + div(p) + '</td><td>' + p.breeders + '</td></tr>').join('') +
      '</tbody></table>';
  }

  // ------------------------------------------------------------- page

  function tile(label, value, sub) {
    return '<div class="tile"><div class="tile-label">' + label + '</div><div class="tile-value">' + value + '</div>' +
      '<div class="tile-sub">' + sub + '</div></div>';
  }

  function pageHTML() {
    const all = data.sheep;
    const lambs = all.filter(r => r.sire).length;
    const out = all.filter(retired).length;
    const now = data.history[data.history.length - 1];
    const newest = data.gens.length - 1;
    const chartWrap = key => '<div class="chart-wrap" data-chart="' + key + '"><svg class="hist-svg" role="img"></svg><div class="chart-tip" hidden></div></div>';
    let html = '<div class="hist"><header class="hist-head"><h1>Flock history</h1>' +
      '<p class="lede">How your flock has changed since the founders. Every sheep counts here, retired ones too.</p></header>' +
      '<div class="tiles">' +
      tile('Sheep', all.length, out ? out + ' retired' : 'none retired') +
      tile('Litters', data.litters.length, plural(lambs, 'lamb') + ' born') +
      tile('Newest generation', newest, newest ? 'founders are 0' : 'only founders so far') +
      tile('Diversity', now.value === null ? '—' : pct(now.value), breeding(now.breeders)) +
      '</div>';
    if (!data.litters.length) {
      return html + '<p class="hist-empty">No litters yet. Breed a few, then come back to see how your flock changes.</p></div>';
    }
    html += '<section class="hist-sec"><h2>Fleece by generation</h2>' +
      '<p>Each dot is a sheep\'s measured fleece. The line joins each generation\'s average. Click a dot to open that sheep.</p>' +
      '<div class="multiples">' + E.TRAITS.map(t => '<figure class="hist-card"><figcaption><b>' + t.name + '</b> <small>' + esc(t.unit) +
        (t.hint ? ' · ' + t.hint : '') + '</small></figcaption>' + chartWrap(t.key) +
        '<p class="hist-note" data-note="' + t.key + '"></p></figure>').join('') + '</div>' +
      '<details class="chart-table"><summary>Show the numbers</summary><div>' + fleeceTable() + '</div></details></section>';
    html += '<section class="hist-sec"><h2>Diversity and inbreeding, litter by litter</h2><p>' + litterNote() + '</p>' +
      '<figure class="hist-card">' + chartWrap('litters') +
      '<p class="hist-note">Diversity counts the sheep that could breed after each litter. A litter of unrelated parents is 0% inbred.</p></figure>' +
      '<details class="chart-table"><summary>Show the numbers</summary><div>' + litterTable() + '</div></details></section>';
    return html + '</div>';
  }

  function draw() {
    hides = [];
    if (!data.litters.length) return;
    for (const t of E.TRAITS) {
      const wrap = root.querySelector('[data-chart="' + t.key + '"]');
      drawFleece(wrap, t);
      root.querySelector('[data-note="' + t.key + '"]').textContent = fleeceNote(t, genAverages(r => r.phenotype.fleece[t.key]));
    }
    drawLitters(root.querySelector('[data-chart="litters"]'));
  }

  /** Builds the page for this flock. opts.open(id) shows a sheep in the flock view. */
  function render(container, f, opts) {
    const first = root === null;
    flock = f;
    openSheep = opts && opts.open;
    root = container;
    data = collect();
    container.innerHTML = pageHTML();
    width = container.clientWidth;
    draw();
    if (!first) return;
    // Charts are drawn to the page's width, so redraw when it changes.
    new ResizeObserver(() => {
      const w = root.clientWidth;
      if (w && w !== width) { width = w; draw(); }
    }).observe(container);
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest || !e.target.closest('.hist-svg')) hides.forEach(h => h());
    });
  }

  window.SheepHistory = { render };
})();
