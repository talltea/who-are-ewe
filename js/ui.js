/* Sheep Genetics Sandbox: flock UI.
 *
 * Reads phenotypes, pedigrees and the player's notes. Never genotypes: those
 * stay inside the engine's flock.
 */
(function () {
  'use strict';

  const E = window.SheepEngine;
  const D = window.SheepDisplay;
  const U = E.UNKNOWN;
  const STORAGE_KEY = 'sheep-genetics-sandbox/v1';
  const FILE_FORMAT = 'sheep-genetics-sandbox';
  const MAX_OUTCOMES = 8;
  const MAX_CHIPS = 24;

  // Names that suit any sheep, plus given names that read as one sex.
  const NAMES = [
    'Bramble', 'Clover', 'Thistle', 'Rowan', 'Moss', 'Sorrel', 'Bracken', 'Pip', 'Nettle', 'Yarrow',
    'Burdock', 'Sloe', 'Damson', 'Quince', 'Pippin', 'Medlar', 'Sage', 'Chicory', 'Fennel', 'Dill',
    'Mallow', 'Campion', 'Vetch', 'Teasel', 'Woad', 'Madder', 'Weld', 'Alder', 'Birch', 'Aspen',
    'Elder', 'Larch', 'Linden', 'Maple', 'Hawthorn', 'Blackthorn', 'Gorse', 'Broom', 'Fog', 'Drizzle',
    'Squall', 'Frost', 'Hail', 'Mist', 'Dew', 'Thaw', 'Sleet', 'Breeze', 'Tempest', 'Dusk',
    'Cinder', 'Soot', 'Flint', 'Pebble', 'Shale', 'Slate', 'Granite', 'Clay', 'Loam', 'Peat',
    'Tweed', 'Fluff', 'Muffin', 'Crumpet', 'Scone', 'Bannock', 'Oatcake', 'Barley', 'Rye', 'Spelt',
    'Biscuit', 'Toffee', 'Fudge', 'Treacle', 'Nutmeg', 'Clove', 'Cocoa', 'Mocha', 'Pepper', 'Paprika',
    'Cumin', 'Caraway', 'Crocus', 'Lupin', 'Foxglove', 'Dandelion', 'Pudding', 'Dumpling', 'Noodle', 'Waffle',
    'Pickle', 'Button', 'Bobbin', 'Spindle', 'Skein', 'Purl', 'Bobble', 'Tufty', 'Haggis', 'Robin',
  ];
  const SEX_NAMES = {
    ram: [
      'Angus', 'Hamish', 'Fergus', 'Dougal', 'Rory', 'Wilbur', 'Lambert', 'Woolsey', 'Otis', 'Brodie',
      'Hector', 'Basil', 'Archie', 'Barnaby', 'Bertie', 'Cuthbert', 'Duncan', 'Ewan', 'Murdo', 'Rufus',
      'Monty', 'Wallace', 'Lachlan', 'Torquil', 'Jasper', 'Ramsay', 'Alfie', 'Callum', 'Struan', 'Teddy',
    ],
    ewe: [
      'Morag', 'Agnes', 'Effie', 'Isla', 'Elspeth', 'Dolly', 'Mabel', 'Ada', 'Ailsa', 'Kirsty',
      'Nessie', 'Juno', 'Flora', 'Maisie', 'Shona', 'Peggy', 'Hettie', 'Winnie', 'Daisy', 'Violet',
      'Iris', 'Poppy', 'Heather', 'Hazel', 'Ivy', 'Holly', 'Myrtle', 'Primrose', 'Willow', 'Fern',
      'Juniper', 'Marigold', 'Pansy', 'Bluebell', 'Buttercup', 'Snowdrop', 'Cowslip', 'Tansy', 'Saffron', 'Wren',
    ],
  };

  // ------------------------------------------------------------- state

  let flock = null;
  let notes = {};
  const ui = {
    view: 'flock',
    side: 'sheep',
    selected: null,
    pen: { ram: null, ewe: null },
    sex: 'all',
    allele: '',
    sort: 'born',
    dir: 1,
    showRemoved: false,
    suggest: false,
    renaming: false,
    removeArmed: false,
    lastLitter: null,
    fantasyNotes: true,
  };
  const fresh = new Map(); // id -> time it arrived, for the highlight
  const FRESH_MS = 2400;
  const surpriseCache = new Map();
  // Results of "check sure guesses", per sheep: { checked, wrong: Set('gene:slot'), stale }.
  // Not saved: a reload clears them.
  const checks = new Map();

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = v => Math.round(v * 1000) / 10 + '%';

  // The genes this flock has: the base ones, plus fantasy genes if it was started with them.
  const genesOn = () => flock.activeGenes();
  const hasGene = key => genesOn().some(g => g.key === key);

  // Hidden dev flag: index.html?dev=opal puts unfinished fantasy genes in new fantasy flocks.
  const DEV_GENES = (new URLSearchParams(location.search).get('dev') || '').split(',')
    .filter(k => E.GENE[k] && E.GENE[k].dev);
  // A ram's first slot of an X-linked gene is his Y, which has no allele.
  const isY = (r, gene, i) => i === 0 && !!r && r.sex === 'ram' && !!E.GENE[gene].xLinked;

  // ------------------------------------------------------------- names

  function roman(n) {
    let s = '';
    for (const [v, c] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
      while (n >= v) { s += c; n -= v; }
    }
    return s;
  }

  function nameFor(sex) {
    const used = new Set(flock ? flock.list({ includeRemoved: true }).map(r => r.name) : []);
    const names = NAMES.concat(SEX_NAMES[sex] || []);
    for (let k = 1; ; k++) {
      const pool = names.map(n => (k === 1 ? n : n + ' ' + roman(k))).filter(n => !used.has(n));
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
  }

  function nameOf(id) {
    const r = id && flock.get(id);
    return r ? r.name : 'unknown';
  }

  // ---------------------------------------------------- breeding limits

  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

  function retired(r) { return flock.breedingsLeft(r.id) === 0; }

  function retiredText(r) {
    return r.name + ' has been bred ' + plural(r.litters.length, 'time') + ', the most a ' + r.sex + ' can be.';
  }

  // ------------------------------------------------------------- notes

  // genes: two guess slots per gene. ruledOut: alleles the player says the
  // sheep definitely doesn't have, which count as sure.
  function blankNote() {
    const genes = {};
    const ruledOut = {};
    for (const g of genesOn()) {
      genes[g.key] = [{ a: U, sure: false }, { a: U, sure: false }];
      ruledOut[g.key] = [];
    }
    return { genes, ruledOut, text: '' };
  }

  function noteFor(id) {
    if (!notes[id]) notes[id] = blankNote();
    return notes[id];
  }

  function guessOf(id) {
    const genes = genesOn();
    const guess = E.blankGuess(genes);
    const n = notes[id];
    if (n) {
      guess.ruledOut = {};
      for (const g of genes) {
        guess[g.key] = n.genes[g.key].map(s => s.a);
        guess.ruledOut[g.key] = n.ruledOut[g.key].slice();
      }
    }
    const r = flock.get(id);
    for (const g of genes) if (isY(r, g.key, 0)) guess[g.key][0] = null;
    return guess;
  }

  function sanitizeNotes(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const id of Object.keys(raw)) {
      if (!flock.get(id)) continue;
      const src = raw[id] || {};
      const r = flock.get(id);
      const n = blankNote();
      if (typeof src.text === 'string') n.text = src.text;
      for (const g of genesOn()) {
        const slots = src.genes && src.genes[g.key];
        if (!Array.isArray(slots)) continue;
        slots.slice(0, 2).forEach((s, i) => {
          if (isY(r, g.key, i)) return;
          if (s && (s.a === U || E.allele(g.key, s.a))) n.genes[g.key][i] = { a: s.a, sure: !!s.sure };
        });
      }
      for (const g of genesOn()) {
        const outs = src.ruledOut && src.ruledOut[g.key];
        if (!Array.isArray(outs)) continue;
        const valid = [...new Set(outs.filter(a => E.allele(g.key, a)))];
        // Never rule out every allele, or an allele that's in a slot.
        const used = n.genes[g.key].map(sl => sl.a);
        n.ruledOut[g.key] = valid.length < g.alleles.length ? valid.filter(a => !used.includes(a)) : [];
      }
      out[id] = n;
    }
    return out;
  }

  function alleleSym(gene, a) { return a === null ? 'Y' : a === U ? '?' : E.allele(gene, a).sym; }

  function guessSym(id, gene) {
    const g = guessOf(id);
    const out = (g.ruledOut && g.ruledOut[gene]) || [];
    return g[gene].map(a => alleleSym(gene, a)).join('/') +
      (out.length ? ', not ' + out.map(a => alleleSym(gene, a)).join(' or ') : '');
  }

  // Has the player written anything about these genes for this sheep?
  function hasGuesses(id, genes) {
    const g = guessOf(id);
    return genes.some(k => g[k] && (g[k].some(a => a !== U && a !== null) || (g.ruledOut && g.ruledOut[k].length)));
  }

  // ------------------------------------------------------ checking work

  // Everything checkable in a sheep's notes: sure slots and ruled-out alleles.
  function sureOf(id) {
    const sure = {};
    const ruledOut = {};
    let count = 0;
    const n = notes[id];
    if (n) {
      for (const g of genesOn()) {
        sure[g.key] = n.genes[g.key].map(s => (s.sure && s.a !== U ? (count++, s.a) : null));
        ruledOut[g.key] = n.ruledOut[g.key].slice();
        count += ruledOut[g.key].length;
      }
    }
    return { sure, ruledOut, count };
  }

  // Check one sheep's sure guesses. Returns null if it has none.
  function runCheck(id) {
    const { sure, ruledOut, count } = sureOf(id);
    if (!count) { checks.delete(id); return null; }
    const res = flock.checkSureGuesses(id, sure, ruledOut);
    checks.set(id, {
      checked: res.checked,
      wrong: new Set(res.wrong.map(w => (w.ruledOut ? w.gene + ':out:' + w.ruledOut : w.gene + ':' + w.slot))),
      stale: false,
    });
    return res;
  }

  // A gene's guesses changed, so its old result no longer applies.
  function notesEdited(id, gene) {
    const c = checks.get(id);
    if (!c) return;
    for (const k of [...c.wrong]) if (k.startsWith(gene + ':')) c.wrong.delete(k);
    c.stale = true;
    if (!c.wrong.size) checks.delete(id);
  }

  const isWrong = (id, gene, slot) => !!(checks.get(id) && checks.get(id).wrong.has(gene + ':' + slot));
  const isWrongOut = (id, gene, a) => isWrong(id, gene, 'out:' + a);

  function wrongGenes(id) {
    const c = checks.get(id);
    return c ? E.GENES.filter(g => [...c.wrong].some(k => k.startsWith(g.key + ':'))).map(g => g.key) : [];
  }

  function checkHTML(r) {
    const c = checks.get(r.id);
    if (!c) return '';
    if (!c.wrong.size) {
      return c.stale ? '' : '<div class="check-ok">' + (c.checked === 1 ? 'Your sure guess is right.' : 'All ' + c.checked + ' sure guesses are right.') + '</div>';
    }
    const items = [];
    for (const gene of wrongGenes(r.id)) {
      const name = E.GENE[gene].name;
      const nWrong = [0, 1].filter(i => isWrong(r.id, gene, i)).length;
      if (nWrong) {
        const sure = noteFor(r.id).genes[gene].filter(s => s.sure && s.a !== U);
        const both = sure.map(s => alleleSym(gene, s.a)).join('/');
        items.push(nWrong === 2 ? 'Both of your sure ' + name + ' alleles (' + both + ') are wrong.'
          : sure.length === 2 ? 'One of your sure ' + name + ' alleles (' + both + ') is wrong.'
          : 'Your sure ' + name + ' allele ' + both + ' is wrong.');
      }
      for (const a of noteFor(r.id).ruledOut[gene]) {
        if (isWrongOut(r.id, gene, a)) items.push('You ruled out ' + alleleSym(gene, a) + ' for ' + name + ', but that\'s wrong.');
      }
    }
    return '<ul class="flags check-flags">' + items.map(t => '<li>' + t + '</li>').join('') + '</ul>';
  }

  function checkAll() {
    let sheep = 0;
    let checked = 0;
    const withMistakes = [];
    for (const r of flock.list({ includeRemoved: true })) {
      const res = runCheck(r.id);
      if (!res) continue;
      sheep++;
      checked += res.checked;
      if (res.wrong.length) withMistakes.push(r.name);
    }
    refresh();
    if (!checked) { toast('Nothing to check yet. Mark a guess as sure first.'); return; }
    const head = 'Checked ' + checked + ' sure guess' + (checked === 1 ? '' : 'es') + ' on ' + sheep + ' sheep. ';
    if (!withMistakes.length) { toast(head + 'All right!'); return; }
    const names = withMistakes.length > 4 ? withMistakes.slice(0, 4).join(', ') + ' and ' + (withMistakes.length - 4) + ' more'
      : withMistakes.join(', ');
    toast(head + 'Mistakes on ' + names + '.');
  }

  // ---------------------------------------------------------- surprises

  function lambIssues(r) {
    if (!r.sire || !r.dam) return [];
    const sg = guessOf(r.sire);
    const dg = guessOf(r.dam);
    const key = E.lookKey(r.phenotype) + '|' + JSON.stringify(sg) + JSON.stringify(dg);
    let v = surpriseCache.get(key);
    if (!v) {
      if (surpriseCache.size > 5000) surpriseCache.clear();
      v = E.checkLamb(r.phenotype, sg, dg);
      surpriseCache.set(key, v);
    }
    return v;
  }

  function culpritText(gi, r) {
    const gene = E.GENE[gi.gene].name;
    const s = nameOf(r.sire);
    const d = nameOf(r.dam);
    switch (gi.culprit) {
      case 'sire': return s + "'s " + gene;
      case 'dam': return d + "'s " + gene;
      case 'either': return s + "'s or " + d + "'s " + gene;
      default: return gene + ' for both ' + s + ' and ' + d;
    }
  }

  function surpriseText(r, issues) {
    return issues.filter(i => !i.rare).flatMap(i => i.genes.map(g => culpritText(g, r))).join('; ');
  }

  // What each part of a look is called in messages.
  const PART_WORD = {
    pattern: 'pattern', 'dark color': 'dark color', shade: 'shade', spots: 'spots',
    horns: 'horns', opal: 'sheen', speckle: 'speckles', glow: 'glow',
  };

  // e.g. "Bramble's dark color (moorit)", with the name as a link.
  function partHTML(sheep, trait) {
    const word = trait === 'pattern' && sheep.phenotype.color === 'white' ? 'color' : PART_WORD[trait];
    return '<button class="link" data-open="' + sheep.id + '">' + esc(sheep.name) + '</button>\'s ' + word +
      ' (' + esc(D.part(sheep.phenotype, trait)) + ')';
  }

  const MUTATION_ODDS = 'about 1 in ' + Math.round(1 / E.SPECKLE_MUTATION_RATE) + ' passed-on alleles';

  // Lambs of r whose looks contradict r's guesses, as { html, rare }.
  function parentFlags(r) {
    const out = [];
    for (const litter of r.litters) {
      for (const lid of litter.lambs) {
        const lamb = flock.get(lid);
        if (!lamb) continue;
        const role = lamb.sire === r.id ? 'sire' : 'dam';
        const other = role === 'sire' ? lamb.dam : lamb.sire;
        for (const issue of lambIssues(lamb)) {
          for (const gi of issue.genes) {
            if (gi.culprit !== role && gi.culprit !== 'either' && gi.culprit !== 'both') continue;
            const gene = E.GENE[gi.gene].name;
            const mine = 'your ' + gene + ' guess (' + guessSym(r.id, gi.gene) + ')';
            const theirs = esc(nameOf(other)) + "'s (" + guessSym(other, gi.gene) + ')';
            const who = partHTML(lamb, issue.trait);
            if (issue.rare) {
              out.push({ rare: true, html: '<b>Rare:</b> ' + who + ' would need a new mutation to fit ' + mine + ' and ' + theirs +
                '. Mutations hit ' + MUTATION_ODDS + ', so a guess may be off instead.' });
              continue;
            }
            let html;
            if (gi.culprit === role) html = who + " can't come from " + mine + '.';
            else if (gi.culprit === 'either') html = who + ' means ' + mine + ' or ' + theirs + ' is off.';
            else html = who + ' means ' + mine + ' and ' + theirs + ' both need a change.';
            out.push({ html });
          }
        }
      }
    }
    return out;
  }

  // ----------------------------------------------------------- persistence

  function persistUi() {
    return {
      view: ui.view, side: ui.side, selected: ui.selected, pen: ui.pen,
      sex: ui.sex, allele: ui.allele, sort: ui.sort, dir: ui.dir, showRemoved: ui.showRemoved,
      fantasyNotes: ui.fantasyNotes,
    };
  }

  function snapshot() {
    return { format: FILE_FORMAT, version: 2, savedAt: new Date().toISOString(), flock: flock.exportState(), notes, ui: persistUi() };
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    } catch (e) {
      toast("Couldn't save in this browser. Use Export to keep your flock.");
    }
  }

  // Replace the current flock with saved data. Throws if the data is bad.
  function applyData(data) {
    if (!data || data.format !== FILE_FORMAT || !data.flock) throw new Error('Not a sheep sandbox file');
    const next = E.createFlock({ nameFor });
    next.importState(data.flock);
    flock = next;
    notes = sanitizeNotes(data.notes);
    for (const r of flock.list({ includeRemoved: true })) noteFor(r.id);
    const u = data.ui || {};
    ui.view = u.view === 'guide' ? 'guide' : 'flock';
    ui.side = u.side === 'breed' ? 'breed' : 'sheep';
    ui.selected = u.selected && flock.get(u.selected) ? u.selected : null;
    ui.pen = { ram: null, ewe: null };
    if (u.pen) {
      for (const sex of ['ram', 'ewe']) {
        const r = u.pen[sex] && flock.get(u.pen[sex]);
        if (r && !r.removed && r.sex === sex) ui.pen[sex] = r.id;
      }
    }
    ui.sex = ['all', 'ram', 'ewe'].includes(u.sex) ? u.sex : 'all';
    ui.allele = typeof u.allele === 'string' ? u.allele : '';
    ui.sort = typeof u.sort === 'string' ? u.sort : 'born';
    ui.dir = u.dir === -1 ? -1 : 1;
    ui.showRemoved = !!u.showRemoved;
    ui.fantasyNotes = u.fantasyNotes !== false;
    ui.lastLitter = null;
    ui.suggest = false;
    ui.renaming = false;
    surpriseCache.clear();
    checks.clear();
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      applyData(JSON.parse(raw));
      return true;
    } catch (e) {
      console.warn('Could not load saved flock', e);
      return false;
    }
  }

  function starterFlock(fantasy) {
    const devGenes = fantasy ? DEV_GENES : [];
    const sexes = ['ewe', 'ram', 'ewe', 'ewe', 'ram', 'ewe', 'ram', 'ewe'];
    for (let attempt = 0; attempt < 80; attempt++) {
      flock = E.createFlock({ nameFor, fantasy, devGenes });
      const looks = sexes.map(sex => flock.addSheep({ sex }).phenotype);
      const whites = looks.filter(l => l.color === 'white').length;
      if (new Set(looks.map(D.title)).size >= 4 && whites >= 2 && whites <= 4) break;
    }
    notes = {};
    for (const r of flock.list()) noteFor(r.id);
    Object.assign(ui, { selected: null, side: 'sheep', pen: { ram: null, ewe: null }, lastLitter: null, suggest: false, renaming: false });
    surpriseCache.clear();
    checks.clear();
  }

  function exportFlock() {
    const blob = new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flock-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Flock exported.');
  }

  function importFlock(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyData(JSON.parse(reader.result));
        saveNow();
        renderAll();
        toast('Imported ' + flock.list().length + ' sheep.');
      } catch (e) {
        toast("That file isn't a flock export.");
      }
    };
    reader.readAsText(file);
  }

  // ------------------------------------------------------------- toast

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 3200);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    $('toast').classList.remove('show');
  }

  // ------------------------------------------------------------- grid

  function visibleSheep() {
    let list = flock.list({ includeRemoved: ui.showRemoved });
    if (ui.sex !== 'all') list = list.filter(r => r.sex === ui.sex);
    if (ui.allele) {
      const [gene, a] = ui.allele.split(':');
      list = list.filter(r => notes[r.id] && notes[r.id].genes[gene] && notes[r.id].genes[gene].some(s => s.a === a));
    }
    const trait = E.TRAIT[ui.sort];
    const key = trait ? r => r.phenotype.fleece[trait.key]
      : ui.sort === 'name' ? r => r.name.toLowerCase()
      : ui.sort === 'gen' ? r => r.gen
      : r => r.born;
    return list.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (x < y ? -1 : x > y ? 1 : a.born - b.born) * ui.dir;
    });
  }

  function chipsHTML(id) {
    const n = notes[id];
    if (!n) return '';
    const r = flock.get(id);
    const parts = [];
    for (const g of genesOn()) {
      const slots = n.genes[g.key];
      const outs = n.ruledOut[g.key];
      if (slots.every(s => s.a === U) && !outs.length) continue;
      const tip = g.name + ': ' + slots.map((s, i) => (isY(r, g.key, i) ? 'Y' : s.a === U ? '?' : E.allele(g.key, s.a).plain + (s.sure ? ' (sure)' : ' (hunch)'))).join(' / ') +
        (outs.length ? '; not ' + outs.map(a => E.allele(g.key, a).plain).join(' or ') : '');
      parts.push('<span class="gchip" title="' + esc(tip) + '"><span class="pair">' +
        slots.map((s, i) => (isY(r, g.key, i) ? '<span class="slot y">Y</span>'
          : '<span class="slot ' + (s.a === U ? 'unk' : s.sure ? 'sure' : 'hunch') + (isWrong(id, g.key, i) ? ' wrong' : '') + '">' +
          alleleSym(g.key, s.a) + '</span>')).join('') + '</span>' +
        outs.map(a => '<span class="slot out' + (isWrongOut(id, g.key, a) ? ' wrong' : '') + '">' + alleleSym(g.key, a) + '</span>').join('') +
        '</span>');
    }
    return parts.length ? '<div class="chips">' + parts.join('') + '</div>' : '';
  }

  function cardHTML(r) {
    const d = D.describe(r.phenotype);
    const issues = lambIssues(r);
    const cls = ['card'];
    if (r.id === ui.selected) cls.push('is-selected');
    if (r.removed) cls.push('is-removed');
    const age = fresh.has(r.id) ? Date.now() - fresh.get(r.id) : Infinity;
    if (age < FRESH_MS) cls.push('is-fresh');
    const inPen = ui.pen.ram === r.id || ui.pen.ewe === r.id;
    if (inPen) cls.push('in-pen');
    const trait = E.TRAIT[ui.sort];
    const stat = trait
      ? '<div class="card-stat">' + r.phenotype.fleece[trait.key].toFixed(1) + ' <small>' + trait.unit + '</small></div>'
      : '';
    const real = issues.filter(i => !i.rare);
    const flag = real.length
      ? '<div class="card-flag" title="This lamb looks impossible under your guesses. Check: ' + esc(surpriseText(r, real)) + '">' +
        '<span class="flag-dot">!</span><span>Surprise: ' + esc(surpriseText(r, real)) + '</span></div>'
      : issues.length
        ? '<div class="card-flag rare" title="Its parents\' guesses can\'t explain this lamb without a new mutation."><span class="flag-dot">~</span>' +
          '<span>Rare: could be a new mutation</span></div>'
        : '';
    const wrong = wrongGenes(r.id).map(k => E.GENE[k].name);
    const mistake = wrong.length
      ? '<div class="card-flag"><span class="flag-dot">✗</span><span>Wrong sure guess: ' + wrong.join(', ') + '</span></div>'
      : '';
    const pen = r.removed || (retired(r) && !inPen) ? '' :
      '<button class="pen-btn" data-pen="' + r.id + '" title="' + (inPen ? 'In the breeding pen' : 'Put in the breeding pen') +
      '" aria-label="Put ' + esc(r.name) + ' in the breeding pen" aria-pressed="' + inPen + '">♥︎</button>';
    return '<div class="' + cls.join(' ') + '"' + (age < FRESH_MS ? ' style="animation-delay:-' + age + 'ms"' : '') +
      ' data-id="' + r.id + '" data-fk="card-' + r.id + '" tabindex="0" role="button" aria-label="' +
      esc(r.name + ', ' + d.sex + ', ' + d.title) + '">' +
      '<div class="card-top">' + D.swatch(r.phenotype, 'md') + pen + '</div>' +
      '<div class="card-name"><span class="nm">' + esc(r.name) + '</span><span class="sex" title="' + d.sex + '">' + d.sexIcon + '</span></div>' +
      '<div class="card-meta">Gen ' + r.gen + (r.removed ? ' · removed' : retired(r) ? ' · retired' : '') + '</div>' +
      stat + chipsHTML(r.id) + mistake + flag +
      '</div>';
  }

  function renderGrid() {
    for (const [id, t] of fresh) if (Date.now() - t >= FRESH_MS) fresh.delete(id);
    const list = visibleSheep();
    const all = flock.list();
    const rams = all.filter(r => r.sex === 'ram').length;
    $('flock-count').textContent = all.length + ' sheep · ' + rams + ' ram' + (rams === 1 ? '' : 's') + ', ' +
      (all.length - rams) + ' ewe' + (all.length - rams === 1 ? '' : 's') +
      (list.length !== all.length || ui.showRemoved ? ' · showing ' + list.length : '');
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
    $('grid').innerHTML = list.length
      ? list.map(cardHTML).join('')
      : '<div class="grid-empty">No sheep match these filters.</div>';
    if (focused && focused.startsWith('card-')) {
      const el = $('grid').querySelector('[data-fk="' + focused + '"]');
      if (el) el.focus({ preventScroll: true });
    }
  }

  function renderToolbar() {
    for (const b of document.querySelectorAll('[data-sex]')) b.setAttribute('aria-pressed', String(b.dataset.sex === ui.sex));
    $('allele-filter').value = ui.allele;
    $('sort-select').value = ui.sort;
    $('sort-dir').textContent = ui.dir === 1 ? '↑' : '↓';
    $('sort-dir').title = ui.dir === 1 ? 'Ascending' : 'Descending';
    $('show-removed').checked = ui.showRemoved;
    const last = flock.lastBreeding();
    const undo = $('undo-btn');
    undo.disabled = !last;
    undo.title = last ? 'Remove the litter of ' + nameOf(last.sire) + ' × ' + nameOf(last.dam) : 'Nothing to undo';
    const anySure = flock.list({ includeRemoved: true }).some(r => sureOf(r.id).count > 0);
    $('check-all-btn').disabled = !anySure;
    $('check-all-btn').title = anySure ? 'Flag any guess marked sure that is wrong, on every sheep' : 'Mark a guess as sure first';
  }

  // -------------------------------------------------------- side panel

  function fleeceBars(fleece) {
    return '<div class="bars">' + E.TRAITS.map(t => {
      const v = fleece[t.key];
      const span = t.max - t.min;
      return '<div class="bar-row">' +
        '<span class="bar-label">' + t.name + (t.hint ? ' <small>' + t.hint + '</small>' : '') + '</span>' +
        '<span class="bar"><span class="bar-fill" style="width:' + ((v - t.min) / span * 100).toFixed(1) + '%"></span>' +
        '<span class="bar-mean" style="left:' + ((t.mean - t.min) / span * 100).toFixed(1) + '%" title="Breed average ' + t.mean + ' ' + t.unit + '"></span></span>' +
        '<span class="bar-val">' + v.toFixed(1) + ' <small>' + t.unit + '</small></span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function litterText(r) {
    if (!r.litters.length) return 'No lambs yet';
    const total = r.litters.reduce((a, l) => a + l.lambs.length, 0);
    const lost = r.litters.reduce((a, l) => a + (l.lost || 0), 0);
    const lostText = lost ? lost + ' didn\'t develop' : '';
    if (r.sex === 'ram') {
      return 'Sired ' + plural(total, 'lamb') + ' in ' + plural(r.litters.length, 'litter') + (lost ? ' <span class="muted">(' + lostText + ')</span>' : '');
    }
    return r.litters.map(l => l.lambs.length).join(' · ') + ' <span class="muted">(avg ' + (total / r.litters.length).toFixed(1) + ' per litter' +
      (lost ? '; ' + lostText : '') + ')</span>';
  }

  function breedingsText(r) {
    const left = flock.breedingsLeft(r.id);
    const limit = E.BREEDING_LIMIT[r.sex];
    return left ? left + ' of ' + limit + ' left' : 'All ' + limit + ' used. Retired from breeding';
  }

  function slotControl(id, gene, i) {
    if (isY(flock.get(id), gene.key, i)) {
      return '<span class="y-slot" title="A ram has one X chromosome. His other one is a Y from his sire, which has no ' + gene.name + ' allele.">Y</span>';
    }
    const s = noteFor(id).genes[gene.key][i];
    const state = s.a === U ? 'unk' : s.sure ? 'sure' : 'hunch';
    const wrong = isWrong(id, gene.key, i);
    return '<span class="slot-ctl' + (wrong ? ' wrong' : '') + '"' + (wrong ? ' title="This sure guess is wrong"' : '') + '>' +
      '<select class="slot-select ' + state + '" data-gene="' + gene.key + '" data-slot="' + i + '" data-fk="sel-' + gene.key + i + '" aria-label="' + gene.name + ' allele ' + (i + 1) + '">' +
      '<option value="?"' + (s.a === U ? ' selected' : '') + '>?</option>' +
      gene.alleles.map(a => {
        const out = noteFor(id).ruledOut[gene.key].includes(a.id);
        return '<option value="' + a.id + '"' + (s.a === a.id ? ' selected' : '') + (out ? ' disabled' : '') + '>' +
          esc(a.plain + '  ' + a.name + (out ? ' (ruled out)' : '')) + '</option>';
      }).join('') +
      '</select>' +
      '<button class="conf ' + state + '" data-conf data-gene="' + gene.key + '" data-slot="' + i + '" data-fk="conf-' + gene.key + i + '"' +
      (s.a === U ? ' disabled' : '') + ' title="' + (s.a === U ? 'Pick an allele first' : s.sure ? 'Sure: click to mark as a hunch' : 'Hunch: click to mark as sure') +
      '" aria-label="' + (s.sure ? 'sure' : 'hunch') + '">' + (s.a === U ? '' : s.sure ? 'sure' : 'hunch') + '</button>' +
      '</span>';
  }

  function outRow(r, gene) {
    const n = noteFor(r.id);
    const outs = n.ruledOut[gene.key];
    const used = n.genes[gene.key].map(s => s.a);
    const left = gene.alleles.filter(a => !outs.includes(a.id)).length;
    const chips = gene.alleles.map(a => {
      const on = outs.includes(a.id);
      const inSlot = !on && used.includes(a.id);
      const last = !on && left === 1;
      const title = on ? 'Ruled out: it doesn\'t have ' + a.plain + '. Click to undo.'
        : inSlot ? 'It\'s in your guess above.'
        : last ? 'At least one allele has to stay possible.'
        : 'Click if it definitely doesn\'t have ' + a.plain + ' (' + a.name + ').';
      return '<button class="out-chip' + (on ? ' on' : '') + (isWrongOut(r.id, gene.key, a.id) ? ' wrong' : '') + '" data-out data-gene="' + gene.key +
        '" data-allele="' + a.id + '" data-fk="out-' + gene.key + '-' + a.id + '" aria-pressed="' + on + '"' + (inSlot || last ? ' disabled' : '') +
        ' title="' + esc(title) + '" aria-label="' + esc(gene.name + ': rule out ' + a.name) + '">' + a.sym + '</button>';
    }).join('');
    return '<tr class="out-row"><td class="out-label">Doesn\'t have</td><td colspan="3"><div class="out-chips">' + chips + '</div></td></tr>';
  }

  function suggestRow(r, gene) {
    const pick = (parentId, slot, label) => {
      if (isY(r, gene.key, slot)) return '<span class="pick-group"><span class="faint">' + label + ' gave a Y</span></span>';
      const alleles = [...new Set(guessOf(parentId)[gene.key].filter(a => a !== U && a !== null))];
      const chips = alleles.length
        ? alleles.map(a => '<button class="pick" data-pick data-gene="' + gene.key + '" data-slot="' + slot + '" data-allele="' + a + '" title="Use ' + esc(E.allele(gene.key, a).name) + '">' + alleleSym(gene.key, a) + '</button>').join('')
        : '<span class="faint">no guess</span>';
      return '<span class="pick-group"><span class="faint">' + label + '</span>' + chips + '</span>';
    };
    return '<tr class="suggest-row"><td></td><td>' + pick(r.sire, 0, '♂︎') + '</td><td></td><td>' + pick(r.dam, 1, '♀︎') + '</td></tr>';
  }

  // Fantasy genes in the notes: a group the player can fold away.
  function fantasyNotesHTML(r, genes, row) {
    if (!genes.length) return '';
    const noted = genes.filter(g => hasGuesses(r.id, [g.key])).length;
    return '<div class="fantasy-notes">' +
      '<button class="fantasy-toggle" data-act="fantasy-notes" data-fk="fantasy-notes" aria-expanded="' + ui.fantasyNotes + '">' +
      '<span class="chev" aria-hidden="true">▸</span>Fantasy genes' + (noted ? ' <span class="faint">· ' + noted + ' with notes</span>' : '') + '</button>' +
      (ui.fantasyNotes
        ? '<table class="notes-table">' + genes.map(row).join('') + '</table>' +
          (r.sex === 'ram' && hasGene('opal') ? '<p class="hint">A ram has one X chromosome, so he has one Opal allele. The Y came from his sire.</p>' : '') +
          '<p class="hint">Gilded tips have no row: they come from many genes at once, so there\'s no single gene to pin down. ' +
          '<button class="link" data-view="guide" data-anchor="g-gilded">How gilded works</button></p>'
        : '') +
      '</div>';
  }

  function notesHTML(r) {
    const n = noteFor(r.id);
    const hasParents = !!(r.sire && r.dam);
    const flags = parentFlags(r).map(f => '<li' + (f.rare ? ' class="rare"' : '') + '>' + f.html + '</li>');
    for (const issue of E.checkSelf(r.phenotype, guessOf(r.id))) {
      const genes = issue.genes.map(g => E.GENE[g].name).join(' + ');
      flags.push('<li>Your ' + genes + ' guess doesn\'t fit ' + partHTML(r, issue.trait) + '.</li>');
    }
    const row = g =>
      '<tbody class="gene-rows"><tr><th scope="row">' + g.name + '</th><td>' + slotControl(r.id, g, 0) + '</td><td class="slash">/</td><td>' + slotControl(r.id, g, 1) + '</td></tr>' +
      outRow(r, g) + (ui.suggest && hasParents ? suggestRow(r, g) : '') + '</tbody>';
    const genes = genesOn();
    const rows = genes.filter(g => !g.fantasy).map(row).join('');
    return '<section class="sp-sec">' +
      '<div class="sec-head"><h3>My notes</h3><div class="sec-actions">' +
      (hasParents ? '<button class="btn btn-small" data-act="suggest" aria-pressed="' + ui.suggest + '">' + (ui.suggest ? 'Hide parents\' alleles' : 'Suggest from parents') + '</button>' : '') +
      '<button class="btn btn-small" data-act="check-one" data-fk="check-one"' + (sureOf(r.id).count ? '' : ' disabled') +
      ' title="' + (sureOf(r.id).count ? 'Flag any guess marked sure that is wrong' : 'Mark a guess as sure first') + '">Check sure guesses</button>' +
      '</div></div>' +
      checkHTML(r) +
      (flags.length ? '<ul class="flags">' + flags.join('') + '</ul>' : '') +
      (ui.suggest && hasParents ? '<p class="hint">Click an allele to use it: the left slot comes from the ram, the right from the ewe.</p>' : '') +
      '<table class="notes-table">' + rows + '</table>' +
      fantasyNotesHTML(r, genes.filter(g => g.fantasy), row) +
      '<p class="hint">Solid chips are <b>sure</b>, outlined ones are a <b>hunch</b>. Click the label next to a slot to switch. ' +
      'Under <b>Doesn\'t have</b>, click an allele to rule it out: a "?" then means any allele that\'s left. Ruled-out alleles count as sure. ' +
      '<b>Check sure guesses</b> flags any sure guess that\'s wrong, without saying what\'s right.</p>' +
      '<textarea class="notes-text" data-notes-text="' + r.id + '" data-fk="notes-text" rows="4" placeholder="Your reasoning, e.g. &quot;Threw a moorit lamb with Juniper, so she must carry brown.&quot;">' + esc(n.text) + '</textarea>' +
      '</section>';
  }

  function pedNode(id, role) {
    const r = id && flock.get(id);
    if (!r) return '<div class="ped-node unknown"><span class="ped-role">' + role + '</span><span class="faint">unknown</span></div>';
    return '<button class="ped-node" data-open="' + r.id + '"><span class="ped-role">' + role + '</span>' +
      D.swatch(r.phenotype, 'sm') + '<span class="ped-name">' + esc(r.name) + '</span>' +
      (r.removed ? '<span class="tag">removed</span>' : '') + '</button>';
  }

  function inbreedingNote(F) {
    return F < 0.0625 ? 'distant relatives; a slight hit to fleece and litter size'
      : F < 0.2 ? 'related parents; fleece and litter size take a small hit'
      : 'closely related parents; fleece and litter size take a noticeable hit';
  }

  function pedigreeHTML(r) {
    let tree;
    if (!r.sire && !r.dam) {
      tree = '<p class="muted">Founder: parents unknown.</p>';
    } else {
      const s = flock.get(r.sire);
      const d = flock.get(r.dam);
      tree = '<div class="ped">' +
        '<div class="ped-p" style="grid-row:1 / 3">' + pedNode(r.sire, 'Sire') + '</div>' +
        '<div class="ped-p" style="grid-row:3 / 5">' + pedNode(r.dam, 'Dam') + '</div>' +
        '<div class="ped-g" style="grid-row:1">' + pedNode(s && s.sire, 'Sire\'s sire') + '</div>' +
        '<div class="ped-g" style="grid-row:2">' + pedNode(s && s.dam, 'Sire\'s dam') + '</div>' +
        '<div class="ped-g" style="grid-row:3">' + pedNode(d && d.sire, 'Dam\'s sire') + '</div>' +
        '<div class="ped-g" style="grid-row:4">' + pedNode(d && d.dam, 'Dam\'s dam') + '</div>' +
        '</div>';
    }
    const F = r.inbreeding || 0;
    const note = !r.sire ? 'founder' : F === 0 ? 'parents are unrelated, as far as the pedigree shows' : inbreedingNote(F);
    return '<section class="sp-sec"><h3>Pedigree</h3>' + tree +
      '<div class="inbreeding">Inbreeding <strong>' + pct(F) + '</strong> <span class="muted">· ' + note + '</span></div></section>';
  }

  function lambsHTML(r) {
    if (!r.litters.length) return '';
    const rows = r.litters.slice().reverse().map(l => {
      const lambs = l.lambs.map(id => flock.get(id)).filter(Boolean);
      const lost = l.lost ? ' · ' + (l.lambs.length ? plural(l.lambs.length, 'lamb') : 'no lambs') + ' · ' + l.lost + ' didn\'t develop' : '';
      return '<div class="litter"><span class="litter-mate">with ' + esc(nameOf(l.mate)) + lost + '</span>' +
        lambs.map(x => '<button class="lamb-chip" data-open="' + x.id + '" title="' + esc(D.title(x.phenotype) + ', ' + D.describe(x.phenotype).hornTag) + '">' +
          D.swatch(x.phenotype, 'xs') + esc(x.name) + ' <span class="faint">' + D.sexIcon(x.sex) + '</span></button>').join('') +
        '</div>';
    }).join('');
    return '<section class="sp-sec"><h3>Lambs</h3>' + rows + '</section>';
  }

  // Fantasy genes plus gilded, which isn't one gene but counts as one here.
  function fantasyCount() {
    const n = genesOn().filter(g => g.fantasy).length + E.LIABILITIES.length;
    return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][n] || String(n);
  }

  function introHTML() {
    return '<div class="intro">' +
      '<h2>Welcome to the flock</h2>' +
      '<p>Every sheep carries hidden genes. You only see what they look like.</p>' +
      '<ol>' +
      '<li><b>Click a sheep</b> to see its color, horns and fleece, and to write down your guesses about its genes.</li>' +
      '<li><b>Click ♥︎</b> on a ram and on a ewe to put them in the breeding pen.</li>' +
      '<li><b>Breed them</b> and compare the lambs with what your notes predicted. A lamb that doesn\'t fit your guesses gets a surprise flag.</li>' +
      '<li><b>Plan your crosses.</b> A ram can be bred ' + E.BREEDING_LIMIT.ram + ' times and a ewe ' + E.BREEDING_LIMIT.ewe + ', then they retire.</li>' +
      '</ol>' +
      '<p class="muted">New to sheep genetics? The <button class="link" data-view="guide">Genetics guide</button> explains how it all works.</p>' +
      (flock.fantasy
        ? '<p class="muted">This flock has <b>fantasy genes</b>: ' + fantasyCount() + ' made-up genes, each a small example of a real way genes behave. ' +
          'See <button class="link" data-view="guide" data-anchor="g-fantasy">Fantasy genes</button> in the guide.</p>'
        : '') +
      '</div>';
  }

  function sheepPanelHTML(r) {
    if (!r) return introHTML();
    const d = D.describe(r.phenotype);
    const parents = r.sire ? 'Lamb of ' + esc(nameOf(r.sire)) + ' × ' + esc(nameOf(r.dam)) : 'Founder';
    const title = ui.renaming
      ? '<input class="rename-input" id="rename-input" data-fk="rename" value="' + esc(r.name) + '" maxlength="40" aria-label="New name">' +
        '<button class="btn btn-small" data-act="rename-save">Save</button>'
      : '<h2>' + esc(r.name) + ' <span class="sex-big">' + d.sexIcon + '</span></h2>';
    const actions = r.removed
      ? '<button class="btn btn-small" data-act="restore">Return to flock</button>'
      : '<button class="btn btn-small" data-act="rename">Rename</button>' +
        (retired(r)
          ? '<button class="btn btn-small" disabled title="' + esc(retiredText(r)) + '">♥︎ Retired</button>'
          : '<button class="btn btn-small" data-pen="' + r.id + '">♥︎ Put in pen</button>') +
        '<button class="btn btn-small btn-danger' + (ui.removeArmed ? ' armed' : '') + '" data-act="remove">' + (ui.removeArmed ? 'Click again to remove' : 'Remove from flock') + '</button>';
    return '<div class="sp-head">' + D.swatch(r.phenotype, 'xl') +
      '<div class="sp-title">' + title + '<div class="muted">' + d.sex + ' · Generation ' + r.gen + ' · ' + parents + '</div></div></div>' +
      (r.removed ? '<div class="banner">Removed from the flock. Kept for pedigrees.</div>' : '') +
      '<div class="sp-actions">' + actions + '</div>' +
      '<section class="sp-sec"><h3>What you can see</h3><dl class="traits">' +
      '<dt>Color</dt><dd>' + d.color + '</dd>' +
      (flock.fantasy ? '<dt>Shade</dt><dd>' + d.shade + '</dd>' : '') +
      '<dt>Pattern</dt><dd>' + d.pattern + '</dd>' +
      '<dt>Spotting</dt><dd>' + d.spotting + '</dd>' +
      (flock.fantasy
        ? (hasGene('opal') ? '<dt>Sheen</dt><dd>' + d.sheen + '</dd>' : '') + '<dt>Speckles</dt><dd>' + d.speckles + '</dd>' +
          '<dt>Tips</dt><dd>' + d.tips + '</dd><dt>Glow</dt><dd>' + d.glow + '</dd>'
        : '') +
      '<dt>Horns</dt><dd>' + d.hornTag + '</dd>' +
      '<dt>Sex</dt><dd>' + d.sex + '</dd>' +
      '<dt>Litters</dt><dd>' + litterText(r) + '</dd>' +
      '<dt>Breedings</dt><dd>' + breedingsText(r) + '</dd>' +
      '</dl>' + fleeceBars(r.phenotype.fleece) + '</section>' +
      notesHTML(r) + pedigreeHTML(r) + lambsHTML(r);
  }

  // ------------------------------------------------------- breeding pen

  function rangeText(o) {
    if (o.min === o.max) return pct(o.min);
    if (o.min === 0 && o.max < 1) return 'up to ' + pct(o.max);
    return pct(o.min) + '–' + pct(o.max);
  }

  function listWords(words) {
    return words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  }

  // One line naming the "?" guesses that the ranges in these outcomes hinge on.
  function dependsLine(outcomes, ram, ewe) {
    const genes = { sire: new Set(), dam: new Set() };
    for (const o of outcomes) {
      if (o.min !== o.max) for (const dp of o.depends) genes[dp.parent].add(dp.gene);
    }
    const parts = [];
    for (const [parent, r] of [['sire', ram], ['dam', ewe]]) {
      const names = E.GENES.filter(g => genes[parent].has(g.key)).map(g => g.name);
      if (names.length) parts.push(esc(r.name) + "'s " + listWords(names));
    }
    return parts.length ? '<p class="dep">Ranges hinge on the "?" in ' + parts.join(' and ') + '.</p>' : '';
  }

  function penSlot(r, sex) {
    const label = sex === 'ram' ? 'Ram' : 'Ewe';
    if (!r) return '<div class="pen-slot empty"><span class="pen-role">' + label + '</span><span class="faint">Click ♥︎ on a ' + sex + '</span></div>';
    return '<div class="pen-slot"><span class="pen-role">' + label + '</span>' +
      '<button class="pen-sheep" data-open="' + r.id + '">' + D.swatch(r.phenotype, 'md') + '<span>' + esc(r.name) + '</span></button>' +
      '<span class="pen-left' + (retired(r) ? ' none' : '') + '">' + (retired(r) ? 'Retired' : plural(flock.breedingsLeft(r.id), 'breeding') + ' left') + '</span>' +
      '<button class="pen-clear" data-act="clear-' + sex + '" aria-label="Take ' + esc(r.name) + ' out of the pen" title="Take out of the pen">×</button></div>';
  }

  function colorPrediction(pred, ram, ewe) {
    const colorGenes = E.COLOR_GENES.filter(k => E.GENE[k] && genesOn().includes(E.GENE[k]));
    if (!hasGuesses(ram.id, colorGenes) && !hasGuesses(ewe.id, colorGenes)) {
      return '<p class="hint">You haven\'t written color guesses for either parent yet, so every color is possible. ' +
        'Fill in their notes to sharpen this.</p>';
    }
    // Looks that are certain to turn up some of the time get a row; looks that
    // only might turn up (depending on a "?") are listed compactly underneath.
    const likely = pred.colors.filter(o => o.min > 0);
    const maybe = pred.colors.filter(o => o.min === 0);
    const shown = likely.slice(0, MAX_OUTCOMES);
    const rows = shown.map(o =>
      '<tr><td class="sw">' + D.swatch(o.value, 'sm') + '</td><td>' + esc(D.title(o.value)) +
      '</td><td class="num">' + rangeText(o) + '</td></tr>').join('');
    const extra = maybe.concat(likely.slice(MAX_OUTCOMES));
    const more = extra.length - MAX_CHIPS;
    const chips = extra.length
      ? '<div class="maybe"><div class="maybe-head">' + (likely.length ? 'Also possible' : 'Possible looks') + '</div>' +
        extra.slice(0, MAX_CHIPS).map(o => '<span class="maybe-chip" title="' + esc(D.title(o.value)) + ': ' + rangeText(o) + '">' + D.swatch(o.value, 'xs') +
          esc(D.title(o.value)) + ' <span class="faint">' + rangeText(o).replace('up to ', '≤ ') + '</span></span>').join('') +
        (more > 0 ? '<span class="maybe-more">and ' + plural(more, 'more look') + '</span>' : '') +
        '</div>'
      : '';
    return (rows ? '<table class="pred">' + rows + '</table>' : '') + chips + colorPartsHTML(pred) + dependsLine(pred.colors, ram, ewe);
  }

  // Fantasy flocks: dark color and shade on their own, since combined looks get numerous.
  function colorPartsHTML(pred) {
    const parts = [['Dark color', pred.colorParts.dark, v => D.COLOR_NAME[v]], ['Shade', pred.colorParts.shade, v => D.SHADE_NAME[v]]];
    if (!pred.colorParts.shade) return '';
    return '<div class="parts"><div class="maybe-head">Lambs that aren\'t white, part by part</div>' + parts.map(([label, list, name]) =>
      '<div class="part-line"><span>' + label + '</span><span class="part-vals">' +
      list.map(o => '<span>' + name(o.value) + ' <b class="num">' + rangeText(o) + '</b></span>').join('') + '</span></div>').join('') +
      '</div>';
  }

  const OPAL_WORD = { full: 'Opal', patchy: 'Patchy', none: 'Plain' };
  const GLOW_WORD = { glow: 'Glowing', plain: 'Plain', lost: 'Not born' };

  function outcomeLine(label, outcomes, word) {
    return '<div class="horn-line"><span>' + label + '</span><span class="part-vals">' +
      outcomes.map(o => '<span>' + word[o.key] + ' <b class="num">' + rangeText(o) + '</b></span>').join('') + '</span></div>';
  }

  function fantasyPrediction(pred, ram, ewe) {
    const guessed = gene => hasGuesses(ram.id, [gene]) || hasGuesses(ewe.id, [gene]);
    const gild = flock.predictGilded(ram.id, ewe.id);
    return (pred.opal
      ? '<h4>Opal <small>sex-linked</small></h4>' +
        (guessed('opal')
          ? outcomeLine('Ram lambs', pred.opal.ram, OPAL_WORD) + outcomeLine('Ewe lambs', pred.opal.ewe, OPAL_WORD) +
            dependsLine(pred.opal.ram.concat(pred.opal.ewe), ram, ewe)
          : '<p class="hint">No Opal guesses yet. Ram lambs get their one X from the ewe, ewe lambs get one X from each parent.</p>')
      : '') +
      '<h4>Speckles</h4>' +
      (guessed('speckle')
        ? '<div class="horn-line"><span>Speckled</span><span class="num">' + rangeText(pred.speckle) + '</span></div>' +
          dependsLine([pred.speckle], ram, ewe) + '<p class="dep">Not counting new mutations (' + MUTATION_ODDS + ').</p>'
        : '<p class="hint">No Speckle guesses yet.</p>') +
      '<h4>Glow <small>two copies of L are lethal</small></h4>' +
      (guessed('lantern')
        ? outcomeLine('Lambs', pred.glow, GLOW_WORD) + dependsLine(pred.glow, ram, ewe)
        : '<p class="hint">No Lantern guesses yet.</p>') +
      '<h4>Gilded tips</h4>' +
      '<div class="horn-line"><span>Chance per lamb</span><span class="num">about ' + Math.round(gild * 100) + '%</span></div>' +
      '<p class="dep">From which parents and ancestors are gilded. Your notes don\'t change it.</p>';
  }

  function hornLine(h, sexWord) {
    return '<div class="horn-line"><span>' + sexWord + '</span><span class="num">' + rangeText(h) + ' horned</span></div>';
  }

  function fleeceRange(t, pr, ram, ewe) {
    const span = t.max - t.min;
    const x = v => ((v - t.min) / span * 100).toFixed(1) + '%';
    return '<div class="range-row">' +
      '<div class="range-head"><span>' + t.name + '</span><span class="num">' + pr.low.toFixed(1) + '–' + pr.high.toFixed(1) + ' <small>' + t.unit + '</small></span></div>' +
      '<div class="range-track"><span class="range-band" style="left:' + x(pr.low) + ';width:' + ((pr.high - pr.low) / span * 100).toFixed(1) + '%"></span>' +
      '<span class="range-mean" style="left:' + x(pr.mean) + '"></span>' +
      '<span class="range-parent" style="left:' + x(ram.phenotype.fleece[t.key]) + '" title="' + esc(ram.name) + ': ' + ram.phenotype.fleece[t.key] + '"></span>' +
      '<span class="range-parent" style="left:' + x(ewe.phenotype.fleece[t.key]) + '" title="' + esc(ewe.name) + ': ' + ewe.phenotype.fleece[t.key] + '"></span></div>' +
      '<div class="range-foot">Parents ' + ram.phenotype.fleece[t.key].toFixed(1) + ' & ' + ewe.phenotype.fleece[t.key].toFixed(1) + ' · typical lamb ' + pr.mean.toFixed(1) + '</div>' +
      '</div>';
  }

  function lostText(lost, born) {
    if (born) return (lost === 1 ? 'One' : lost) + ' didn\'t develop.';
    return lost === 1 ? 'The lamb didn\'t develop.' : lost === 2 ? 'Neither twin developed.' : 'None of the triplets developed.';
  }

  function lastLitterHTML() {
    const last = flock.lastBreeding();
    if (!last || last.id !== ui.lastLitter) return '';
    const lambs = last.lambs.map(id => flock.get(id)).filter(Boolean);
    return '<div class="born"><div class="born-head">' + (lambs.length ? 'Born just now' : 'No lambs this time') +
      (last.lost ? ' · ' + lostText(last.lost, lambs.length) : '') + '</div>' +
      lambs.map(x => '<button class="lamb-chip" data-open="' + x.id + '">' + D.swatch(x.phenotype, 'sm') + esc(x.name) +
        ' <span class="faint">' + D.sexIcon(x.sex) + ' ' + esc(D.title(x.phenotype)) + '</span></button>').join('') +
      '<button class="btn btn-small" data-act="undo">Undo this litter</button></div>';
  }

  function penHTML() {
    const ram = ui.pen.ram && flock.get(ui.pen.ram);
    const ewe = ui.pen.ewe && flock.get(ui.pen.ewe);
    let html = '<div class="pen-slots">' + penSlot(ram, 'ram') + '<span class="pen-x">×</span>' + penSlot(ewe, 'ewe') + '</div>';
    if (!ram || !ewe) {
      return html + lastLitterHTML() + '<p class="hint">Pick a ram and a ewe with the ♥︎ button on their cards. ' +
        'You\'ll see what their lambs might look like, based on your notes.</p>';
    }
    const F = flock.offspringInbreeding(ram.id, ewe.id);
    const pred = E.predictOffspring(guessOf(ram.id), guessOf(ewe.id));
    const fleece = flock.predictFleece(ram.id, ewe.id);
    const guessed = gene => [guessOf(ram.id), guessOf(ewe.id)].some(g =>
      g[gene].some(a => a !== U) || (g.ruledOut && g.ruledOut[gene].length));
    const booGuessed = guessed('booroola');
    const done = [ram, ewe].filter(retired);
    html += '<button class="btn btn-primary btn-wide" data-act="breed" data-fk="breed"' + (done.length ? ' disabled' : '') + '>Breed ' +
      esc(ram.name) + ' × ' + esc(ewe.name) + '</button>';
    if (done.length) {
      html += '<p class="pen-note">' + done.map(r => esc(retiredText(r))).join(' ') + ' Pick another ' +
        (done.length === 2 ? 'pair' : done[0].sex) + ' to keep breeding.</p>';
    }
    html += lastLitterHTML();
    html += '<div class="pen-meta">Lambs\' inbreeding <strong>' + pct(F) + '</strong>' +
      ' <span class="muted">· ' + (F > 0 ? inbreedingNote(F) : 'unrelated') + '</span></div>';
    html += '<section class="sp-sec"><h3>Predicted lambs <small>from your notes</small></h3>' +
      colorPrediction(pred, ram, ewe) +
      '<h4>Horns</h4>' +
      (guessed('horns')
        ? hornLine(pred.horns.ram, 'Ram lambs') + hornLine(pred.horns.ewe, 'Ewe lambs') +
          dependsLine([pred.horns.ram, pred.horns.ewe], ram, ewe)
        : '<p class="hint">No horn guesses yet, so lambs of either sex could be horned or polled.</p>') +
      '<h4>Booroola copies <small>shows in ewe lambs\' litters</small></h4>' +
      (booGuessed
        ? '<div class="boo">' + pred.booroola.map(o => '<span><b>' + o.value + '</b> ' + rangeText(o) + '</span>').join('') + '</div>' +
          dependsLine(pred.booroola, ram, ewe)
        : '<p class="hint">No Booroola guesses yet.</p>') +
      (flock.fantasy ? fantasyPrediction(pred, ram, ewe) : '') +
      '</section>';
    html += '<section class="sp-sec"><h3>Fleece <small>80% of lambs land in this range</small></h3>' +
      E.TRAITS.map(t => fleeceRange(t, fleece[t.key], ram, ewe)).join('') +
      '<p class="hint">Based on measured fleece of the parents and their ancestors. The dark tick is a typical lamb; the open dots are the parents.</p>' +
      '</section>';
    return html;
  }

  let lastSideKey = null;
  function renderSide() {
    const body = $('side-body');
    // Keep the scroll position while editing the same sheep; start at the top for a new one.
    const sideKey = ui.side + ':' + (ui.side === 'sheep' ? ui.selected : '');
    const scroll = sideKey === lastSideKey ? $('side').scrollTop : 0;
    lastSideKey = sideKey;
    const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
    for (const b of document.querySelectorAll('[data-side]')) b.setAttribute('aria-selected', String(b.dataset.side === ui.side));
    const n = (ui.pen.ram ? 1 : 0) + (ui.pen.ewe ? 1 : 0);
    $('pen-count').textContent = n ? n + '/2' : '';
    body.innerHTML = ui.side === 'breed' ? penHTML() : sheepPanelHTML(ui.selected && flock.get(ui.selected));
    $('side').scrollTop = scroll;
    if (focusKey && !focusKey.startsWith('card-')) {
      const el = body.querySelector('[data-fk="' + focusKey + '"]');
      if (el) el.focus({ preventScroll: true });
    }
    if (ui.renaming) {
      const input = $('rename-input');
      if (input) { input.focus(); input.select(); }
    }
  }

  function renderView() {
    const guide = ui.view === 'guide';
    $('view-flock').hidden = guide;
    $('view-guide').hidden = !guide;
    for (const b of document.querySelectorAll('.tab[data-view]')) b.setAttribute('aria-selected', String(b.dataset.view === ui.view));
    if (guide) window.SheepGuide.render($('view-guide'), { fantasy: flock.fantasy, genes: genesOn().map(g => g.key) });
  }

  // Header badge and the allele filter follow the flock's genes.
  let builtFor = null;
  function renderFlockKind() {
    $('fantasy-badge').hidden = !flock.fantasy;
    const kind = genesOn().map(g => g.key).join();
    if (builtFor === kind) return;
    builtFor = kind;
    const genes = genesOn();
    if (ui.allele && !genes.some(g => ui.allele.startsWith(g.key + ':'))) ui.allele = '';
    $('allele-filter').innerHTML = '<option value="">Anything</option>' + genes.map(g =>
      '<optgroup label="' + g.name + (g.fantasy ? ' (fantasy)' : '') + '">' +
      g.alleles.map(a => '<option value="' + g.key + ':' + a.id + '">' + esc(a.plain + '  ' + a.name) + '</option>').join('') +
      '</optgroup>').join('');
  }

  function renderAll() {
    renderFlockKind();
    renderView();
    renderToolbar();
    renderGrid();
    renderSide();
  }

  // Grid and side panel both show notes-derived state.
  function refresh() {
    renderToolbar();
    renderGrid();
    renderSide();
    save();
  }

  // ------------------------------------------------------------ actions

  // On narrow screens the side panel sits below the grid; bring it into view.
  function revealSide() {
    if (window.matchMedia('(max-width: 900px)').matches) $('side').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function select(id) {
    if (ui.selected !== id) { ui.suggest = false; ui.renaming = false; ui.removeArmed = false; }
    ui.selected = id;
    ui.side = 'sheep';
    refresh();
    revealSide();
  }

  function putInPen(id) {
    const r = flock.get(id);
    if (!r || r.removed) return;
    if (retired(r)) { toast(retiredText(r)); return; }
    ui.pen[r.sex] = id;
    ui.side = 'breed';
    refresh();
    if (ui.pen.ram && ui.pen.ewe) revealSide();
  }

  function breed() {
    if (!ui.pen.ram || !ui.pen.ewe) return;
    const done = [ui.pen.ram, ui.pen.ewe].map(id => flock.get(id)).filter(retired);
    if (done.length) { toast(retiredText(done[0])); return; }
    const { event, lambs, lost } = flock.breed(ui.pen.ram, ui.pen.ewe);
    for (const l of lambs) { noteFor(l.id); fresh.set(l.id, Date.now()); }
    ui.lastLitter = event.id;
    refresh();
    const first = lambs.length && document.querySelector('.card[data-id="' + lambs[0].id + '"]');
    if (first) first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const born = !lambs.length ? 'No lambs this time.'
      : lambs.length === 1 ? 'A lamb is born: ' + lambs[0].name + '.'
      : lambs.length + ' lambs are born: ' + lambs.map(l => l.name).join(', ') + '.';
    toast(born + (lost ? ' ' + lostText(lost, lambs.length) : ''));
  }

  function undo() {
    const event = flock.undoLastBreeding();
    if (!event) return;
    for (const id of event.lambs) {
      delete notes[id];
      checks.delete(id);
      fresh.delete(id);
      if (ui.selected === id) ui.selected = null;
      if (ui.pen.ram === id) ui.pen.ram = null;
      if (ui.pen.ewe === id) ui.pen.ewe = null;
    }
    if (ui.lastLitter === event.id) ui.lastLitter = null;
    refresh();
    toast('Undid the litter of ' + nameOf(event.sire) + ' × ' + nameOf(event.dam) + '.');
  }

  function addRandom() {
    const r = flock.addSheep({});
    noteFor(r.id);
    fresh.set(r.id, Date.now());
    ui.selected = r.id;
    ui.side = 'sheep';
    ui.suggest = false;
    refresh();
    const el = document.querySelector('.card[data-id="' + r.id + '"]');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    toast(r.name + ' joins the flock.');
  }

  let removeTimer = null;
  function removeSelected() {
    const r = ui.selected && flock.get(ui.selected);
    if (!r) return;
    if (!ui.removeArmed) {
      ui.removeArmed = true;
      renderSide();
      clearTimeout(removeTimer);
      removeTimer = setTimeout(() => { ui.removeArmed = false; renderSide(); }, 3000);
      return;
    }
    clearTimeout(removeTimer);
    ui.removeArmed = false;
    flock.remove(r.id);
    if (ui.pen[r.sex] === r.id) ui.pen[r.sex] = null;
    refresh();
    toast(r.name + ' left the flock. Tick "Show removed" to find them again.');
  }

  function finishRename() {
    const input = $('rename-input');
    const r = ui.selected && flock.get(ui.selected);
    if (input && r) {
      const name = input.value.trim().slice(0, 40);
      if (name) flock.rename(r.id, name);
    }
    ui.renaming = false;
    refresh();
  }

  function setSlot(gene, slot, allele) {
    const r = ui.selected && flock.get(ui.selected);
    if (!r) return;
    const s = noteFor(r.id).genes[gene][slot];
    s.a = allele;
    if (allele === U) s.sure = false;
    notesEdited(r.id, gene);
    refresh();
  }

  // ------------------------------------------------------------- events

  function setFileMenu(open) {
    $('file-actions').classList.toggle('open', open);
    document.querySelector('[data-act="file-menu"]').setAttribute('aria-expanded', String(open));
  }

  function onClick(e) {
    const t = e.target;
    const menuOpen = $('file-actions').classList.contains('open');
    if (menuOpen && !t.closest('[data-act="file-menu"]')) setFileMenu(false);
    const view = t.closest('[data-view]');
    if (view) {
      ui.view = view.dataset.view;
      hideToast();
      renderView();
      save();
      const anchor = view.dataset.anchor && document.getElementById(view.dataset.anchor);
      if (anchor) anchor.scrollIntoView();
      else window.scrollTo(0, 0);
      return;
    }
    if (t.closest('#toast')) { hideToast(); return; }

    const side = t.closest('[data-side]');
    if (side) { ui.side = side.dataset.side; renderSide(); save(); return; }

    const pen = t.closest('[data-pen]');
    if (pen) { putInPen(pen.dataset.pen); return; }

    const open = t.closest('[data-open]');
    if (open) { select(open.dataset.open); return; }

    const pick = t.closest('[data-pick]');
    if (pick) {
      const r = flock.get(ui.selected);
      if (r) {
        noteFor(r.id).genes[pick.dataset.gene][+pick.dataset.slot] = { a: pick.dataset.allele, sure: false };
        notesEdited(r.id, pick.dataset.gene);
      }
      refresh();
      return;
    }

    const out = t.closest('[data-out]');
    if (out) {
      const r = flock.get(ui.selected);
      if (r) {
        const list = noteFor(r.id).ruledOut[out.dataset.gene];
        const k = list.indexOf(out.dataset.allele);
        if (k >= 0) list.splice(k, 1);
        else list.push(out.dataset.allele);
        notesEdited(r.id, out.dataset.gene);
      }
      refresh();
      return;
    }

    const conf = t.closest('[data-conf]');
    if (conf) {
      const r = flock.get(ui.selected);
      const s = r && noteFor(r.id).genes[conf.dataset.gene][+conf.dataset.slot];
      if (s && s.a !== U) { s.sure = !s.sure; notesEdited(r.id, conf.dataset.gene); refresh(); }
      return;
    }

    const sex = t.closest('[data-sex]');
    if (sex) { ui.sex = sex.dataset.sex; refresh(); return; }

    const act = t.closest('[data-act]');
    if (act) {
      switch (act.dataset.act) {
        case 'file-menu': setFileMenu(!menuOpen); break;
        case 'breed': breed(); break;
        case 'undo': undo(); break;
        case 'add': addRandom(); break;
        case 'rename': ui.renaming = true; renderSide(); break;
        case 'rename-save': finishRename(); break;
        case 'remove': removeSelected(); break;
        case 'restore': flock.restore(ui.selected); refresh(); break;
        case 'suggest': ui.suggest = !ui.suggest; renderSide(); break;
        case 'fantasy-notes': ui.fantasyNotes = !ui.fantasyNotes; renderSide(); save(); break;
        case 'check-one': if (ui.selected) { runCheck(ui.selected); refresh(); } break;
        case 'check-all': checkAll(); break;
        case 'clear-ram': ui.pen.ram = null; refresh(); break;
        case 'clear-ewe': ui.pen.ewe = null; refresh(); break;
        case 'sort-dir': ui.dir = -ui.dir; refresh(); break;
        case 'export': exportFlock(); break;
        case 'import': $('import-file').click(); break;
        case 'new':
          $('new-fantasy').checked = flock.fantasy;
          $('new-dev').hidden = !DEV_GENES.length;
          $('new-dev').textContent = 'Dev flag on: also ' + DEV_GENES.map(k => E.GENE[k].name).join(', ') + '.';
          $('new-dialog').returnValue = '';
          $('new-dialog').showModal();
          break;
      }
      return;
    }

    const card = t.closest('.card[data-id]');
    if (card) select(card.dataset.id);
  }

  function onChange(e) {
    const t = e.target;
    if (t.matches('.slot-select')) { setSlot(t.dataset.gene, +t.dataset.slot, t.value); return; }
    if (t.id === 'allele-filter') { ui.allele = t.value; refresh(); return; }
    if (t.id === 'sort-select') { ui.sort = t.value; ui.dir = 1; refresh(); return; }
    if (t.id === 'show-removed') { ui.showRemoved = t.checked; refresh(); return; }
    if (t.id === 'import-file' && t.files && t.files[0]) { importFlock(t.files[0]); t.value = ''; }
  }

  function onInput(e) {
    const t = e.target;
    if (t.matches('[data-notes-text]')) {
      noteFor(t.dataset.notesText).text = t.value;
      save();
    }
  }

  function onKeydown(e) {
    const t = e.target;
    if (e.key === 'Escape' && $('file-actions').classList.contains('open')) {
      setFileMenu(false);
      document.querySelector('[data-act="file-menu"]').focus();
      return;
    }
    if (t.id === 'rename-input') {
      if (e.key === 'Enter') { e.preventDefault(); finishRename(); }
      if (e.key === 'Escape') { ui.renaming = false; renderSide(); }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('.card[data-id]')) {
      e.preventDefault();
      select(t.dataset.id);
    }
  }

  // -------------------------------------------------------------- init

  function newFlockClosed() {
    if ($('new-dialog').returnValue !== 'ok') return;
    const fantasy = $('new-fantasy').checked;
    starterFlock(fantasy);
    saveNow();
    renderAll();
    toast(fantasy ? 'A fresh flock arrives, with fantasy genes.' : 'A fresh flock arrives.');
  }

  function buildControls() {
    $('sort-select').innerHTML =
      '<option value="born">Oldest first</option><option value="name">Name</option><option value="gen">Generation</option>' +
      '<optgroup label="Fleece">' + E.TRAITS.map(t => '<option value="' + t.key + '">' + t.name + '</option>').join('') + '</optgroup>';
  }

  function init() {
    buildControls();
    if (!loadSaved()) starterFlock();
    if (!E.TRAIT[ui.sort] && !['born', 'name', 'gen'].includes(ui.sort)) ui.sort = 'born';
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKeydown);
    $('new-dialog').addEventListener('close', newFlockClosed);
    window.addEventListener('pagehide', saveNow);
    renderAll();
    saveNow();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
