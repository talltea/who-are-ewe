/* Who Are Ewe? Flock history.
 *
 * How the flock has changed, litter by litter: every look it has had, every
 * sheep in the order it joined the flock, the fleece of the breeding flock,
 * its diversity, and each litter's inbreeding. It reads only what the player can see anyway:
 * looks, measured fleece, pedigrees and litters.
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
    const history = flock.diversityHistory();
    const litters = history.filter(p => p.kind === 'litter');
    const record = birthRecord(sheep, litters);
    // Where each sheep sits on the litter axis, and how to say it.
    const at = new Map();
    const where = new Map();
    for (const e of record.entries) {
      for (const r of e.sheep) {
        at.set(r.id, e.kind === 'start' ? 0 : e.kind === 'added' ? e.after + 0.5 : e.litter.litter);
        where.set(r.id, e.kind === 'start' ? 'founder' : e.kind === 'added' ? 'added after litter ' + e.after : 'litter ' + e.litter.litter);
      }
    }
    return { sheep, history, litters, record, at, where, dex: collection(sheep) };
  }

  const PATTERNS = ['solid', 'badgerface', 'mouflon', 'mixed'];
  const PATTERN_HEAD = { solid: 'Solid', badgerface: 'Badgerface', mouflon: 'Mouflon', mixed: 'Mixed' };

  // Every look the flock can collect, and which sheep have had each: every
  // coat, each sex horned and polled, and each fantasy trait. Coats come in
  // rows of one color and shade, with a plain and a spotted entry for each
  // pattern; white hides all of that, so it's one entry. An entry is
  // { name, look, count, first }: look is what to draw once it's found,
  // first the first sheep to have it, in the order they joined the flock.
  function collection(sheep) {
    const has = key => flock.activeGenes().some(g => g.key === key);
    const coat = look => ({ name: D.title(look), look, key: E.colorKey(look) });
    const rows = [{ label: 'White', entries: [coat({ color: 'white', pattern: 'none', spotted: false })] }];
    const shades = has('dilution') ? ['full', 'dusk', 'frost'] : ['full'];
    for (const color of ['black', 'brown'].concat(has('hue') ? ['rose', 'blue', 'violet'] : [])) {
      for (const shade of shades) {
        const name = D.COLOR_NAME[color];
        rows.push({
          label: shade === 'full' ? name : D.SHADE_NAME[shade] + ' ' + name.toLowerCase(),
          entries: PATTERNS.flatMap(pattern => [false, true].map(spotted => coat({ color, pattern, spotted, shade }))),
        });
      }
    }
    // Other entries draw a white sheep with just that trait.
    const trait = (name, test, extra) => ({ name, test, look: Object.assign({ color: 'white', pattern: 'none', spotted: false }, extra) });
    const horns = ['ram', 'ewe'].flatMap(sex => [true, false].map(horned =>
      trait((horned ? 'Horned ' : 'Polled ') + sex, p => p.sex === sex && !!p.horned === horned, { sex, horned })));
    const fantasy = [
      has('speckle') && trait('Speckled', p => p.speckled, { speckled: true }),
      has('lantern') && trait('Glowing', p => p.glow, { glow: true }),
      flock.fantasy && trait('Gilded', p => p.gilded, { gilded: true }),
      has('opal') && trait('Patchy opal', p => p.opal === 'patchy', { opal: 'patchy' }),
      has('opal') && trait('Opal', p => p.opal === 'full', { opal: 'full' }),
    ].filter(Boolean);

    const inOrder = sheep.slice().sort((a, b) => a.born - b.born);
    const byCoat = new Map();
    for (const r of inOrder) {
      const k = E.colorKey(r.phenotype);
      byCoat.set(k, (byCoat.get(k) || []).concat(r));
    }
    const tally = (e, had) => Object.assign(e, { count: had.length, first: had[0] || null });
    for (const row of rows) for (const e of row.entries) tally(e, byCoat.get(e.key) || []);
    for (const e of horns.concat(fantasy)) tally(e, inOrder.filter(r => e.test(r.phenotype)));
    return { rows, horns, fantasy };
  }

  // Every sheep in the order it joined the flock: the starting founders,
  // then each litter, with founders added later between the litters they
  // came between. firsts maps a sheep to the looks it was first to show,
  // leaving out looks a starting founder already had.
  function birthRecord(sheep, litters) {
    const founders = sheep.filter(r => !r.sire).sort((a, b) => a.born - b.born);
    let i = 0;
    const until = t => { const out = []; while (i < founders.length && founders[i].born <= t) out.push(founders[i++]); return out; };
    const entries = [{ kind: 'start', sheep: until(litters.length ? litters[0].at : Infinity) }];
    for (const l of litters) {
      const added = until(l.at);
      if (added.length) entries.push({ kind: 'added', sheep: added, after: l.litter - 1 });
      entries.push({ kind: 'litter', litter: l, sheep: l.lambs.map(id => flock.get(id)) });
    }
    if (i < founders.length) entries.push({ kind: 'added', sheep: founders.slice(i), after: litters.length });

    const has = key => flock.activeGenes().some(g => g.key === key);
    const looks = [].concat(...D.lookGroups(has, flock.fantasy).map(([part, items]) =>
      items.map(it => ({ test: it.test, word: it.label.toLowerCase() + (part === 'Shade' ? ' shade' : '') }))));
    const seen = new Set();
    const firsts = new Map();
    for (const entry of entries) {
      for (const r of entry.sheep) {
        const fresh = looks.filter(k => !seen.has(k) && k.test(r.phenotype));
        fresh.forEach(k => seen.add(k));
        if (entry.kind !== 'start' && fresh.length) firsts.set(r.id, fresh.map(k => k.word));
      }
    }
    return { entries, firsts };
  }

  const nameOf = id => { const r = flock.get(id); return r ? r.name : 'unknown'; };
  const pairText = p => esc(nameOf(p.sire)) + ' × ' + esc(nameOf(p.dam));
  const retired = r => flock.breedingsLeft(r.id) === 0;

  // The breeding flock's average at the start, after each litter, and now.
  function fleeceAverages(t) {
    return data.history.map((p, i) => (p.ids.length
      ? { i, p, v: mean(p.ids.map(id => flock.get(id).phenotype.fleece[t.key])), n: p.ids.length } : null)).filter(Boolean);
  }

  const pointName = p => (p.kind === 'start' ? 'Start' : p.kind === 'now' ? 'Now' : 'After litter ' + p.litter);

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

  // Litter numbers along the bottom, between "start" and "now", then the axis title.
  function litterAxis(px, N, W, m, y) {
    const L = data.litters.length;
    const room = Math.max(1, Math.floor((W - m.l - m.r) / 34) - 2);
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => L / s <= room) || 1000;
    let svg = text('hc-tick', px(0), y, 'middle', 'start') + text('hc-tick', px(N - 1), y, 'middle', 'now');
    for (let k = step; k <= L; k += step) {
      if (px(k) - px(0) > 30 && px(N - 1) - px(k) > 26) svg += text('hc-tick', px(k), y, 'middle', k);
    }
    return svg + text('hc-tick', (m.l + W - m.r) / 2, y + 18, 'middle', 'Litter');
  }

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

  // Each sheep's fleece at the litter it was born in, and a line for the
  // average of the sheep that could breed after each litter.
  function drawFleece(wrap, t) {
    const W = wrap.clientWidth;
    const H = 210;
    const m = { l: 40, r: 44, t: 10, b: 38 };
    const N = data.history.length;
    const px = i => m.l + i / (N - 1) * (W - m.l - m.r);
    const value = r => r.phenotype.fleece[t.key];
    const { lo, hi, step } = niceRange(Math.min(...data.sheep.map(value)), Math.max(...data.sheep.map(value)), 4);
    const py = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);
    const spread = Math.min((W - m.l - m.r) / (N - 1) * 0.3, 8);
    const dots = data.sheep.map((r, i) => ({ i, id: r.id, r, v: value(r), x: px(data.at.get(r.id)) + jitter(r.id) * spread, y: py(value(r)) }));
    const avgs = fleeceAverages(t).map(a => Object.assign(a, { x: px(a.i), y: py(a.v) }));
    const avgAt = new Map(avgs.map(a => [a.i, a]));

    let svg = yAxis(tickValues(lo, hi, step), py, m.l, W - m.r, v => +v.toFixed(step < 1 ? 1 : 0)) +
      line('hc-axis', m.l, H - m.b, W - m.r, H - m.b) + litterAxis(px, N, W, m, H - m.b + 16);
    svg += dots.map((d, i) => '<circle class="hc-dot" data-i="' + i + '" cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) + '" r="3.5"/>').join('');
    svg += '<path class="hc-line" d="' + pathOf(avgs.map(a => [a.x, a.y])) + '"/>';
    const last = avgs[avgs.length - 1];
    if (last && last.p.kind === 'now') {
      svg += '<circle class="hc-avg" cx="' + last.x + '" cy="' + last.y.toFixed(1) + '" r="4.5"/>' + text('hc-end', last.x + 9, last.y + 4, 'start', one(last.v));
    }
    svg += '<g class="hc-hover" hidden>' + line('hc-cross', 0, m.t, 0, H - m.b) + '<circle class="hc-ring" r="5"/></g>';

    const el = wrap.querySelector('svg');
    el.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    el.setAttribute('height', H);
    el.innerHTML = svg;
    el.setAttribute('aria-label', t.name + ', litter by litter. ' + fleeceNote(t, avgs));

    // A dot right under the pointer wins; anywhere else shows the average there.
    const find = (x, y) => {
      let best = null;
      let bestD = 10 * 10;
      for (const d of dots) {
        const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
        if (dd < bestD) { bestD = dd; best = d; }
      }
      if (best) return Object.assign({ tipY: best.y }, best);
      const a = avgAt.get(Math.max(0, Math.min(N - 1, Math.round((x - m.l) / (W - m.l - m.r) * (N - 1)))));
      return a ? Object.assign({ tipY: a.y }, a) : null;
    };
    const html = h => (h.r
      ? '<b>' + one(h.v) + ' ' + esc(t.unit) + '</b><br>' + D.swatch(h.r.phenotype, 'xs') + ' ' + esc(h.r.name) + ' ' + D.sexIcon(h.r.sex) +
        ' <span>· ' + data.where.get(h.r.id) + (retired(h.r) ? ' · retired' : '') + '</span>'
      : '<b>' + one(h.v) + ' ' + esc(t.unit) + '</b> average<br><span>' + pointName(h.p) + ' · ' + breeding(h.n) + '</span>');
    const hover = el.querySelector('.hc-hover');
    const place = (h, on) => {
      if (h.r) {
        const mark = el.querySelector('[data-i="' + h.i + '"]');
        if (mark) { mark.classList.toggle('on', on); mark.setAttribute('r', on ? 5 : 3.5); }
        return;
      }
      hover.toggleAttribute('hidden', !on);
      if (!on) return;
      const cross = hover.querySelector('.hc-cross');
      cross.setAttribute('x1', h.x);
      cross.setAttribute('x2', h.x);
      const ring = hover.querySelector('.hc-ring');
      ring.setAttribute('cx', h.x);
      ring.setAttribute('cy', h.y);
    };
    hookTip(wrap, find, html, place, openSheep);
  }

  function fleeceNote(t, avgs) {
    const first = avgs[0];
    const last = avgs[avgs.length - 1];
    if (!last || last.p.kind !== 'now') return 'No sheep can breed right now.';
    if (first === last) return 'No litters yet.';
    const d = last.v - first.v;
    const [better, worse] = WORDS[t.key];
    const word = Math.abs(d) < 0.1 * t.sd ? 'about the same as' : (d * t.worseDir < 0 ? better : worse) + ' than';
    return 'Your breeding sheep average ' + one(last.v) + ' ' + t.unit + ' now, ' + word + ' the founders\' ' + one(first.v) + '.';
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

    svg += litterAxis(px, N, W, m, bot[1] + 16);

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

  // ---------------------------------------------------- birth record

  // The founders on a row of their own, then a grid with a cell per litter.
  // A cell says which looks its sheep were first to show.
  function recordHTML() {
    const { entries, firsts } = data.record;
    const sheepButton = (r, where) => {
      const look = D.describe(r.phenotype);
      const first = firsts.get(r.id);
      const tip = r.name + ' ' + D.sexIcon(r.sex) + ' · ' + look.title + ', ' + look.horns.toLowerCase() + '\n' + where +
        (first ? '\nFirst ' + first.join(', ') + ' in the flock' : '');
      return '<button class="br-sheep' + (first ? ' is-first' : '') + '" data-open="' + r.id + '" title="' + esc(tip) + '">' +
        D.swatch(r.phenotype, 'sm') + '</button>';
    };
    const lost = '<span class="br-lost" title="A lamb that didn\'t develop">' + D.emptySwatch('sm', 'A lamb that didn\'t develop') + '</span>';
    const cell = (cls, label, list, body) => {
      const words = [...new Set([].concat(...list.map(r => firsts.get(r.id) || [])))];
      return '<li class="br-cell' + cls + '"><span class="br-num">' + label + '</span><span class="br-lambs">' + body + '</span>' +
        (words.length ? '<span class="br-new">first ' + esc(words.join(', ')) + '</span>' : '') + '</li>';
    };
    let founders = '';
    const cells = [];
    for (const e of entries) {
      if (e.kind === 'start') { founders = e.sheep.map(r => sheepButton(r, 'Founder')).join(''); continue; }
      if (e.kind === 'added') {
        const where = 'Founder, ' + (e.after ? 'added after litter ' + e.after : 'added');
        cells.push(cell(' br-added', 'Added', e.sheep, e.sheep.map(r => sheepButton(r, where)).join('')));
        continue;
      }
      const l = e.litter;
      const where = 'Litter ' + l.litter + ' · ' + nameOf(l.sire) + ' × ' + nameOf(l.dam);
      cells.push(cell('', l.litter, e.sheep, e.sheep.map(r => sheepButton(r, where)).join('') + lost.repeat(l.lost || 0) || '<span class="muted">none</span>'));
    }
    return '<div class="br-founders"><span class="br-tag">Founders</span>' + founders + '</div>' +
      '<ol class="br-grid">' + cells.join('') + '</ol>';
  }

  function recordNote() {
    const n = new Set([].concat(...[...data.record.firsts.values()])).size;
    return 'Every sheep in the order it joined your flock: the founders, then each litter\'s lambs. ' +
      (n ? (n === 1 ? 'One look' : n + ' looks') + ' turned up that no founder had, marked where ' + (n === 1 ? 'it' : 'each') + ' first appeared.'
        : 'Every look so far was already among the founders.');
  }

  // ------------------------------------------------------- collection

  const foundIn = list => list.filter(e => e.first).length;

  // A found look opens the first sheep to have it. One not found yet is a
  // dashed circle.
  function dexItem(e) {
    if (!e.first) {
      const tip = 'Not found yet: ' + e.name;
      return '<span class="dex-item" title="' + esc(tip) + '">' + D.emptySwatch('sm', esc(tip)) + '</span>';
    }
    const r = e.first;
    const tip = e.name + ' · ' + e.count + ' sheep\nFirst: ' + r.name + ', ' + data.where.get(r.id);
    return '<button class="dex-item" data-open="' + r.id + '" title="' + esc(tip) + '">' + D.swatch(e.look, 'sm') + '</button>';
  }

  function dexSection() {
    const { rows, horns, fantasy } = data.dex;
    const coats = rows.flatMap(row => row.entries);
    const all = coats.concat(horns, fantasy);
    const n = foundIn(all);
    const head = (title, list) => '<h3>' + title + ' <span>' + foundIn(list) + ' of ' + list.length + '</span></h3>';
    const grid = '<div class="dex-coats"><span></span>' +
      PATTERNS.map(k => '<span class="dex-head">' + PATTERN_HEAD[k] + '</span>').join('') +
      rows.map(row => '<span class="dex-label">' + esc(row.label) + '</span>' + row.entries.map(dexItem).join('')).join('') + '</div>';
    const list = items => '<ul class="dex-list">' + items.map(e => '<li' + (e.first ? '' : ' class="is-missing"') + '>' + dexItem(e) +
      esc(e.name) + (e.first ? ' <span class="muted">· ' + e.count + '</span>' : '') + '</li>').join('') + '</ul>';
    return '<section class="hist-sec"><h2>Collection</h2><p>Every look your flock has had, founders and retired sheep included. ' +
      (n === all.length ? 'You\'ve found <b>all ' + n + '</b>.' : 'You\'ve found <b>' + n + ' of ' + all.length + '</b>.') + '</p>' +
      '<figure class="hist-card"><div class="dex">' +
      '<div class="dex-block">' + head('Coats', coats) + grid + '<p class="hist-note">Each pattern has a plain coat, then a spotted one.</p></div>' +
      '<div class="dex-block">' + head('Horns', horns) + list(horns) +
      (fantasy.length ? head('Fantasy traits', fantasy) + list(fantasy) : '') + '</div>' +
      '</div><p class="hist-note">Point at a look to see who had it first, and click to open that sheep.' +
      (n < all.length ? ' Dashed circles are looks your flock hasn\'t had yet.' : '') + '</p></figure></section>';
  }

  // ------------------------------------------------------------ tables

  // The breeding flock's average fleece at the start, after each litter, and now.
  function fleeceTable() {
    const avg = (p, t) => (p.ids.length ? one(mean(p.ids.map(id => flock.get(id).phenotype.fleece[t.key]))) : '—');
    return '<table class="data"><thead><tr><th>Litter</th><th>Breeding sheep</th>' +
      E.TRAITS.map(t => '<th>' + t.name + ' <span class="muted">' + esc(t.unit) + '</span></th>').join('') + '</tr></thead><tbody>' +
      data.history.map(p => '<tr><th>' + (p.kind === 'litter' ? p.litter : pointName(p)) + '</th><td>' + p.breeders + '</td>' +
        E.TRAITS.map(t => '<td>' + avg(p, t) + '</td>').join('') + '</tr>').join('') +
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
    const found = [...data.record.firsts.entries()];
    const latest = found[found.length - 1];
    const chartWrap = key => '<div class="chart-wrap" data-chart="' + key + '"><svg class="hist-svg" role="img"></svg><div class="chart-tip" hidden></div></div>';
    let html = '<div class="hist"><header class="hist-head"><h1>Flock history</h1>' +
      '<p class="lede">How your flock has changed since the founders. Every sheep counts here, retired ones too.</p></header>' +
      '<div class="tiles">' +
      tile('Sheep', all.length, out ? out + ' retired' : 'none retired') +
      tile('Litters', data.litters.length, plural(lambs, 'lamb') + ' born') +
      tile('New looks', new Set([].concat(...found.map(([, words]) => words))).size,
        latest ? 'latest: ' + esc(latest[1][latest[1].length - 1]) + ', ' + data.where.get(latest[0]) : 'none yet') +
      tile('Diversity', now.value === null ? '—' : pct(now.value), breeding(now.breeders)) +
      '</div>' + dexSection();
    if (!data.litters.length) {
      return html + '<p class="hist-empty">No litters yet. Breed a few, then come back to see how your flock changes.</p></div>';
    }
    const anyLost = data.litters.some(l => l.lost);
    html += '<section class="hist-sec"><h2>Birth record</h2><p>' + recordNote() + '</p>' +
      '<figure class="hist-card br">' + recordHTML() +
      '<p class="hist-note">Point at a sheep to see who it is, and click to open it.' +
      (anyLost ? ' Dashed circles are lambs that didn\'t develop.' : '') + '</p></figure></section>';
    html += '<section class="hist-sec"><h2>Fleece, litter by litter</h2>' +
      '<p>Each dot is a sheep\'s measured fleece, at the litter it was born in. The line is the average of the sheep that could breed ' +
      'after each litter, so retiring sheep moves it as well as breeding. Click a dot to open that sheep.</p>' +
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
      root.querySelector('[data-note="' + t.key + '"]').textContent = fleeceNote(t, fleeceAverages(t));
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
