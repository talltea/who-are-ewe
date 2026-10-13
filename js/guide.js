/* Sheep Genetics Sandbox: Genetics guide.
 *
 * Teaches with made-up sheep only. It uses the engine's phenotype rules and
 * the flock's display helper. The only thing it knows about the player's
 * flock is whether it has fantasy genes, which adds a section.
 */
(function () {
  'use strict';

  const E = window.SheepEngine;
  const D = window.SheepDisplay;
  const COLOR = ['agouti', 'extension', 'brown', 'spotting'];
  let mounted = null; // which genes the page on screen was built for
  let withOpal = false; // Opal is a dev-only fantasy gene
  let chartTrait = 'diameter';

  const BASE = {
    agouti: ['solid', 'solid'], extension: ['normal', 'normal'], brown: ['normal', 'normal'],
    spotting: ['normal', 'normal'], horns: ['polled', 'polled'], booroola: ['plus', 'plus'],
  };

  function geno(over) {
    const g = {};
    for (const k of Object.keys(BASE)) g[k] = ((over && over[k]) || BASE[k]).slice();
    return g;
  }

  const FANTASY_BASE = {
    dilution: ['full', 'full'], hue: ['normal', 'normal'], opal: ['plain', 'plain'],
    speckle: ['normal', 'normal'], lantern: ['plain', 'plain'],
  };

  // A genotype with the fantasy genes too, all plain unless given.
  function fgeno(over) {
    const g = geno(over);
    for (const k of Object.keys(FANTASY_BASE)) g[k] = ((over && over[k]) || FANTASY_BASE[k]).slice();
    return g;
  }

  // A ram's Y has no allele: it's stored as null.
  const sym = (gene, a) => (a === null ? 'Y' : E.allele(gene, a).sym);
  const pairSym = (gene, p) => sym(gene, p[0]) + '/' + sym(gene, p[1]);
  const pct = v => Math.round(v * 1000) / 10 + '%';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const has = (g, gene, a) => g[gene][0] === a || g[gene][1] === a;

  // Symbols used in prose.
  const S = {
    Aw: sym('agouti', 'white'), Abf: sym('agouti', 'badgerface'), Amf: sym('agouti', 'mouflon'), Aa: sym('agouti', 'solid'),
    ED: sym('extension', 'black'), Ep: sym('extension', 'normal'),
    B: sym('brown', 'normal'), b: sym('brown', 'brown'),
    S: sym('spotting', 'normal'), s: sym('spotting', 'spotted'),
  };

  const PATTERN_WORD = { badgerface: 'badgerface', mouflon: 'mouflon', mixed: 'badgerface/mouflon', solid: 'solid' };

  // ------------------------------------------------- what shows, what hides

  const isWhite = g => has(g, 'agouti', 'white');
  const isDomBlack = g => has(g, 'extension', 'black');

  // The pattern a sheep's agouti alleles would paint without dominant black.
  function agoutiPattern(g) {
    return E.phenotypeOf(Object.assign({}, g, { extension: ['normal', 'normal'] }), 'ewe').pattern;
  }

  // Color genes covered up by another gene.
  function hiddenGenes(g) {
    if (isWhite(g)) return { agouti: false, extension: true, brown: true, spotting: true };
    return { agouti: isDomBlack(g), extension: false, brown: false, spotting: false };
  }

  // What this sheep's look is covering up, in a few words.
  function hidingNote(g) {
    if (isWhite(g)) return isDomBlack(g) ? 'white wins over dominant black' : 'white hides its other color genes';
    if (isDomBlack(g)) {
      const p = agoutiPattern(g);
      return p === 'solid' ? 'agouti hidden by dominant black' : PATTERN_WORD[p] + ' hidden by dominant black';
    }
    return '';
  }

  // Full color genotype; genes that are present but covered up are greyed.
  function gtLine(g) {
    const hid = hiddenGenes(g);
    return '<span class="gt-line">' + COLOR.map(k =>
      '<span class="gt-gene' + (hid[k] ? ' hid' : '') + '" title="' + E.GENE[k].name + (hid[k] ? ': present, but hidden' : '') + '">' +
      pairSym(k, g[k]) + '</span>').join('') + '</span>';
  }

  function ex(over, opts) {
    const o = opts || {};
    const g = geno(over);
    const look = E.phenotypeOf(g, 'ewe');
    const note = o.note !== undefined ? o.note : hidingNote(g);
    return '<figure class="ex">' + D.swatch(look, 'lg') +
      '<figcaption><b>' + esc(o.label || D.title(look)) + '</b>' + (o.noGenotype ? '' : gtLine(g)) +
      (note ? '<span class="ex-note">' + esc(note) + '</span>' : '') + '</figcaption></figure>';
  }

  // Small inline swatch with a label.
  function chip(over, label) {
    const look = E.phenotypeOf(geno(over), 'ewe');
    return '<span class="look-chip">' + D.swatch(look, 'sm') + esc(label || D.title(look)) + '</span>';
  }

  // ------------------------------------------------------------- flow

  // One step of reading a sheep: a question about its look, then what that
  // look proves about its genes and what it leaves hidden.
  function flowStep(n, question, looks, tells, hidden) {
    return '<div class="flow-step">' +
      '<div class="flow-q"><span class="flow-n">' + n + '</span><div><b>' + question + '</b><div class="flow-outs">' + looks + '</div></div></div>' +
      '<div class="flow-a"><div class="flow-yes">That tells you</div>' + tells +
      (hidden ? '<p class="flow-hidden"><b>Still hidden:</b> ' + hidden + '</p>' : '') + '</div></div>';
  }

  function finishRow(question, looks, tells) {
    return '<div class="finish-row"><div class="finish-q"><b>' + question + '</b><span class="finish-ex">' + looks + '</span></div>' +
      '<div class="finish-a">' + tells + '</div></div>';
  }

  function flowHTML(fantasy) {
    const Ep2 = S.Ep + '/' + S.Ep;
    const bf = { agouti: ['badgerface', 'solid'] };
    return '<div class="flow">' +
      flowStep(1, 'Is the sheep white?', chip({ agouti: ['white', 'solid'] }),
        '<p>It has at least one white agouti allele (' + S.Aw + '). White removes color from the whole sheep.</p>',
        'everything else: its other agouti allele, Extension, Brown and Spotting. Stop here.') +
      '<div class="flow-no">No ↓</div>' +
      flowStep(2, 'Is it one solid color, with no pattern?',
        chip({ extension: ['black', 'normal'] }) + chip({ extension: ['black', 'normal'], brown: ['brown', 'brown'] }),
        '<p>It has no ' + S.Aw + '. Then one of two things is true:</p><ul>' +
        '<li>it has dominant black (' + S.ED + '), which spreads dark color everywhere and covers any pattern, <b>or</b></li>' +
        '<li>it has no dominant black (' + Ep2 + ') and two solid agouti alleles (' + S.Aa + '/' + S.Aa + ').</li></ul>',
        'which of the two is true. If it\'s dominant black, its agouti alleles are hidden too.') +
      '<div class="flow-no">No ↓</div>' +
      flowStep(3, 'Then it shows a pattern.',
        chip(bf, 'Badgerface') + chip({ agouti: ['mouflon', 'solid'] }, 'Mouflon') + chip({ agouti: ['badgerface', 'mouflon'] }, 'Both'),
        '<p>It has no dominant black (' + Ep2 + '), or the pattern would be covered. The pattern names its agouti alleles:</p><ul>' +
        '<li><b>Badgerface:</b> ' + S.Abf + ', plus ' + S.Abf + ' or ' + S.Aa + '</li>' +
        '<li><b>Mouflon:</b> ' + S.Amf + ', plus ' + S.Amf + ' or ' + S.Aa + '</li>' +
        '<li><b>Both:</b> ' + S.Abf + '/' + S.Amf + '</li></ul>',
        'whether a badgerface or mouflon sheep carries ' + S.Aa + '.') +
      '</div>' +
      '<div class="finish"><div class="finish-head">Then, for any sheep that isn\'t white, ' + (fantasy ? 'a few' : 'two') + ' more questions:</div>' +
      finishRow('Is the dark color moorit rather than black?',
        chip(bf) + '<span class="faint">or</span>' + chip({ agouti: ['badgerface', 'solid'], brown: ['brown', 'brown'] }),
        '<b>Moorit:</b> ' + S.b + '/' + S.b + '.<br><b>Black:</b> at least one ' + S.B + '; it may carry ' + S.b + '.') +
      finishRow('Does it have white patches?',
        chip({}) + '<span class="faint">or</span>' + chip({ spotting: ['spotted', 'spotted'] }),
        '<b>Patches:</b> ' + S.s + '/' + S.s + '.<br><b>No patches:</b> at least one ' + S.S + '; it may carry ' + S.s + '.') +
      (fantasy ? fantasyFinishRows() : '') +
      '</div>' +
      (fantasy ? fantasySurfaceBox() : '');
  }

  // ------------------------------------------------- fantasy: reading a sheep

  const F = {
    D: sym('dilution', 'full'), d: sym('dilution', 'dilute'),
    Hp: sym('hue', 'normal'), Hr: sym('hue', 'rose'), Hb: sym('hue', 'blue'),
    XO: sym('opal', 'opal'), Xp: sym('opal', 'plain'),
    St: sym('speckle', 'normal'), st: sym('speckle', 'speckled'),
    L: sym('lantern', 'glow'), Lp: sym('lantern', 'plain'),
  };

  // Small swatch for a fantasy look. extra adds fields genes don't give, like gilded.
  function fchip(over, label, extra) {
    const look = Object.assign(E.phenotypeOf(fgeno(over), (extra && extra.sex) || 'ewe'), extra && extra.look);
    return '<span class="look-chip">' + D.swatch(look, 'sm') + esc(label || D.title(look)) + '</span>';
  }

  function fantasyFinishRows() {
    return finishRow('<span class="tag">Fantasy</span> Is the dark color rose, blue or violet?',
        fchip({ hue: ['rose', 'rose'] }) + fchip({ hue: ['rose', 'blue'] }) + fchip({ hue: ['blue', 'blue'] }),
        '<b>Rose:</b> ' + F.Hr + '/' + F.Hr + '. <b>Blue:</b> ' + F.Hb + '/' + F.Hb + '. <b>Violet:</b> ' + F.Hr + '/' + F.Hb + '. ' +
        'Hue hides Brown, so its brown alleles are unknown.<br><b>Black or moorit:</b> at least one ' + F.Hp + '.') +
      finishRow('<span class="tag">Fantasy</span> Is it dusk or frost?',
        fchip({}, 'Full') + fchip({ dilution: ['full', 'dilute'] }, 'Dusk') + fchip({ dilution: ['dilute', 'dilute'] }, 'Frost'),
        '<b>Full:</b> ' + F.D + '/' + F.D + '. <b>Dusk:</b> ' + F.D + '/' + F.d + '. <b>Frost:</b> ' + F.d + '/' + F.d + '. The shade shows both alleles.');
  }

  function fantasySurfaceBox() {
    const white = { agouti: ['white', 'solid'] };
    return '<div class="finish"><div class="finish-head"><span class="tag">Fantasy</span> For any sheep, white or not: ' +
      (withOpal ? 'sheen? ' : '') + 'speckles? gilded tips? glow?</div>' +
      (withOpal
        ? finishRow('Does it have an opal sheen?',
          fchip(Object.assign({ opal: ['opal', 'plain'] }, white)) + fchip(Object.assign({ opal: ['opal', 'opal'] }, white)),
          '<b>A ram:</b> his one X is ' + F.XO + ', or ' + F.Xp + ' if he has none.<br><b>A ewe:</b> patchy is ' + F.XO + '/' + F.Xp +
          ', full opal ' + F.XO + '/' + F.XO + ', no sheen ' + F.Xp + '/' + F.Xp + '.')
        : '') +
      finishRow('Does it have gold speckles?',
        fchip({ speckle: ['speckled', 'speckled'] }) + fchip(Object.assign({ speckle: ['speckled', 'speckled'] }, white)),
        '<b>Speckles:</b> ' + F.st + '/' + F.st + '.<br><b>None:</b> at least one ' + F.St + '; it may carry ' + F.st + '.') +
      finishRow('Does it have gilded tips?',
        fchip({}, 'Gilded', { look: { gilded: true } }) + fchip(white, 'White, gilded', { look: { gilded: true } }),
        'Its hidden score passed the cutoff. There are no alleles to write down: see <a href="#g-gilded">Gilded</a>.') +
      finishRow('Does it glow?',
        fchip({ lantern: ['glow', 'plain'] }) + fchip(Object.assign({ lantern: ['glow', 'plain'] }, white)),
        '<b>Glowing:</b> ' + F.L + '/' + F.Lp + ', always. ' + F.L + '/' + F.L + ' lambs don\'t develop.<br><b>No glow:</b> ' + F.Lp + '/' + F.Lp + '.') +
      '</div>';
  }

  // --------------------------------------------------- pattern table

  const PT_ROWS = [
    { label: S.Aw + ' with anything', agouti: ['white', 'solid'] },
    { label: S.Abf + ' with ' + S.Abf + ' or ' + S.Aa, agouti: ['badgerface', 'solid'] },
    { label: S.Amf + ' with ' + S.Amf + ' or ' + S.Aa, agouti: ['mouflon', 'solid'] },
    { label: S.Abf + ' with ' + S.Amf, agouti: ['badgerface', 'mouflon'] },
    { label: S.Aa + ' with ' + S.Aa, agouti: ['solid', 'solid'] },
  ];
  let ptMoorit = false;

  function ptableHTML() {
    const brown = ptMoorit ? ['brown', 'brown'] : ['normal', 'normal'];
    const cell = (agouti, extension) => {
      const g = geno({ agouti, extension, brown });
      const look = E.phenotypeOf(g, 'ewe');
      // The column header already says which side has dominant black.
      const note = hidingNote(g).replace(' by dominant black', '').replace('white hides its other color genes', 'hides the other color genes');
      return '<td><div class="pt-cell' + (note ? ' is-hiding' : '') + '">' + D.swatch(look, 'md') +
        '<span><b>' + esc(D.title(look)).replace('/', '/<wbr>') + '</b>' + (note ? '<small>' + esc(note).replace('/', '/<wbr>') + '</small>' : '') + '</span></div></td>';
    };
    return '<div class="seg" role="group" aria-label="Brown alleles">' +
      '<button data-ptable="black" aria-pressed="' + !ptMoorit + '">Black: ' + S.B + '/' + S.B + ' or ' + S.B + '/' + S.b + '</button>' +
      '<button data-ptable="moorit" aria-pressed="' + ptMoorit + '">Moorit: ' + S.b + '/' + S.b + '</button></div>' +
      '<div class="pt-scroll"><table class="ptable"><thead><tr><th>Agouti alleles</th>' +
      '<th>No dominant black<span>' + S.Ep + '/' + S.Ep + '</span></th>' +
      '<th>Dominant black<span>' + S.ED + ' with ' + S.ED + ' or ' + S.Ep + '</span></th></tr></thead><tbody>' +
      PT_ROWS.map(r => '<tr><th scope="row">' + r.label + '</th>' + cell(r.agouti, ['normal', 'normal']) + cell(r.agouti, ['black', 'normal']) + '</tr>').join('') +
      '</tbody></table></div>';
  }

  // ------------------------------------------------------ build a sheep

  const builder = {
    agouti: ['badgerface', 'solid'], extension: ['black', 'normal'], brown: ['normal', 'brown'], spotting: ['normal', 'normal'],
  };
  const JOBS = { agouti: 'pattern, or white', extension: 'can override the pattern', brown: 'black or moorit', spotting: 'white patches' };

  function alleleSelect(attrs, gene, value, label) {
    return '<select ' + attrs + ' aria-label="' + label + '">' + E.GENE[gene].alleles.map(a =>
      '<option value="' + a.id + '"' + (a.id === value ? ' selected' : '') + '>' + esc(a.plain + '  ' + a.name) + '</option>').join('') + '</select>';
  }

  function traceHTML(g) {
    const white = isWhite(g);
    const black = isDomBlack(g);
    const rows = [];
    const row = (cls, gene, text) => rows.push('<li class="' + cls + '"><span class="t-gene">' + gene + '</span><span>' + text + '</span></li>');
    const A = pairSym('agouti', g.agouti);
    const X = pairSym('extension', g.extension);

    if (white) row('decides', 'Agouti', A + ' has a white allele, so the sheep is <b>white</b>. Stop here.');
    else row('', 'Agouti', A + ': no white allele. Keep going.');

    if (white) row('skipped', 'Extension', X + ': hidden by white.');
    else if (black) {
      const p = agoutiPattern(g);
      row('decides', 'Extension', X + ' has dominant black, so the sheep is <b>solid</b>. ' +
        (p === 'solid' ? 'Its agouti is hidden.' : 'Its agouti alleles (' + A + ') would make it ' + PATTERN_WORD[p] + ', but that\'s hidden.'));
    } else row('', 'Extension', X + ': no dominant black, so agouti decides the pattern.');

    if (!white && !black) {
      const p = agoutiPattern(g);
      const word = p === 'mixed' ? 'badgerface and mouflon at once' : p === 'solid' ? 'solid (two solid alleles)' : p;
      const carries = g.agouti.includes('solid') && p !== 'solid' ? ' It carries ' + S.Aa + ' without showing it.' : '';
      row('decides', 'Agouti', A + ' makes it <b>' + word + '</b>.' + carries);
    }

    const Bp = pairSym('brown', g.brown);
    const bb = g.brown[0] === 'brown' && g.brown[1] === 'brown';
    if (white) row('skipped', 'Brown', Bp + ': hidden by white.');
    else if (bb) row('decides', 'Brown', Bp + ': two brown alleles, so the dark color is <b>moorit</b>.');
    else row('decides', 'Brown', Bp + ': the dark color is <b>black</b>.' + (g.brown.includes('brown') ? ' It carries ' + S.b + ' without showing it.' : ''));

    const Sp = pairSym('spotting', g.spotting);
    const ss = g.spotting[0] === 'spotted' && g.spotting[1] === 'spotted';
    if (white) row('skipped', 'Spotting', Sp + ': hidden by white. White patches don\'t show on a white sheep.');
    else if (ss) row('decides', 'Spotting', Sp + ': <b>white patches</b>.');
    else row('decides', 'Spotting', Sp + ': no patches.' + (g.spotting.includes('spotted') ? ' It carries ' + S.s + ' without showing it.' : ''));

    return '<ol class="trace">' + rows.join('') + '</ol>';
  }

  function builderHTML() {
    const g = geno(builder);
    const look = E.phenotypeOf(g, 'ewe');
    const controls = COLOR.map(k =>
      '<div class="b-gene"><span>' + E.GENE[k].name + ' <small>' + JOBS[k] + '</small></span>' +
      alleleSelect('data-b="' + k + '" data-i="0"', k, builder[k][0], E.GENE[k].name + ' allele 1') + '<span class="faint">/</span>' +
      alleleSelect('data-b="' + k + '" data-i="1"', k, builder[k][1], E.GENE[k].name + ' allele 2') + '</div>').join('');
    return '<div class="b-controls">' + controls + '</div>' +
      '<div class="b-result"><div class="b-head">' + D.swatch(look, 'xl') +
      '<div><div class="b-title">' + esc(D.title(look)) + '</div>' + gtLine(g) + '</div></div>' + traceHTML(g) + '</div>';
  }

  // ----------------------------------------------------------- Punnett

  const PUNNETTS = {
    spotting: { genes: ['spotting'], sire: geno({ spotting: ['normal', 'spotted'] }), dam: geno({ spotting: ['normal', 'spotted'] }) },
    whiteWhite: { genes: ['agouti'], sire: geno({ agouti: ['white', 'solid'] }), dam: geno({ agouti: ['white', 'solid'] }) },
    agouti: { genes: ['agouti'], sire: geno({ agouti: ['badgerface', 'solid'] }), dam: geno({ agouti: ['mouflon', 'solid'] }) },
    extension: {
      genes: ['extension'],
      sire: geno({ agouti: ['badgerface', 'badgerface'], extension: ['black', 'normal'] }),
      dam: geno({ agouti: ['badgerface', 'badgerface'] }),
    },
    brown: { genes: ['brown'], sire: geno({ brown: ['normal', 'brown'] }), dam: geno({ brown: ['normal', 'brown'] }) },
    horns: {
      genes: ['horns'], bySex: true,
      sire: geno({ agouti: ['white', 'white'], horns: ['horned', 'polled'] }),
      dam: geno({ agouti: ['white', 'white'], horns: ['horned', 'polled'] }),
    },
    testCross: { genes: ['agouti'], sire: geno({ agouti: ['white', 'mouflon'] }), dam: geno({}) },
    // Fantasy genes. plain: show only the square's gene, not the color genotype.
    dilution: { genes: ['dilution'], plain: true, sire: fgeno({ dilution: ['full', 'dilute'] }), dam: fgeno({ dilution: ['full', 'dilute'] }) },
    hue: {
      genes: ['hue'], plain: true,
      sire: fgeno({ hue: ['rose', 'blue'], brown: ['brown', 'brown'] }), dam: fgeno({ hue: ['rose', 'blue'], brown: ['brown', 'brown'] }),
    },
    opal: {
      genes: ['opal'], plain: true,
      sire: fgeno({ agouti: ['white', 'white'], opal: [null, 'plain'] }), dam: fgeno({ agouti: ['white', 'white'], opal: ['opal', 'plain'] }),
    },
    speckle: { genes: ['speckle'], plain: true, sire: fgeno({ speckle: ['normal', 'speckled'] }), dam: fgeno({ speckle: ['normal', 'speckled'] }) },
    lantern: { genes: ['lantern'], plain: true, sire: fgeno({ lantern: ['glow', 'plain'] }), dam: fgeno({ lantern: ['glow', 'plain'] }) },
  };

  // What a parent can pass on. A ram passes his X to daughters and his Y (null) to sons.
  function passes(cfg, parent, gene) {
    const pair = cfg[parent][gene];
    return E.GENE[gene].xLinked && parent === 'sire' ? [pair[1], null] : pair;
  }

  function gametes(cfg, parent) {
    let out = [{}];
    for (const gene of cfg.genes) {
      const next = [];
      for (const partial of out) for (const a of passes(cfg, parent, gene)) next.push(Object.assign({}, partial, { [gene]: a }));
      out = next;
    }
    return out;
  }

  function cloneGeno(g) {
    const out = {};
    for (const k of Object.keys(g)) out[k] = g[k].slice();
    return out;
  }

  function parentHTML(key, cfg, parent) {
    const sex = parent === 'sire' ? 'ram' : 'ewe';
    const g = cfg[parent];
    const look = E.phenotypeOf(g, sex);
    const d = D.describe(look);
    // A parent with two lethal alleles could never have been born.
    const lethal = E.GENES.find(gene => gene.lethal && g[gene.key] && g[gene.key].every(a => a === gene.lethal));
    const note = lethal ? 'Can\'t exist: ' + g[lethal.key].map(a => E.allele(lethal.key, a).plain).join('/') + ' lambs don\'t develop'
      : cfg.bySex || cfg.plain ? '' : hidingNote(g);
    const selects = cfg.genes.map(gene =>
      '<div class="pn-gene"><span>' + E.GENE[gene].name + '</span>' +
      (g[gene][0] === null
        ? '<span class="pn-y" title="A ram\'s second sex chromosome is a Y, with no ' + E.GENE[gene].name + ' allele">Y</span>'
        : alleleSelect('data-pn="' + key + '" data-parent="' + parent + '" data-gene="' + gene + '" data-i="0"', gene, g[gene][0], d.sex + ' ' + E.GENE[gene].name + ' allele 1')) +
      '<span class="faint">/</span>' +
      alleleSelect('data-pn="' + key + '" data-parent="' + parent + '" data-gene="' + gene + '" data-i="1"', gene, g[gene][1], d.sex + ' ' + E.GENE[gene].name + ' allele 2') +
      '</div>').join('');
    return '<div class="pn-parent">' +
      '<div class="pn-who">' + D.swatch(look, 'md') + '<div><b>' + d.sex + ' ' + d.sexIcon + '</b>' +
      '<div class="muted">' + esc(cfg.bySex ? d.hornTag : D.title(look)) + '</div>' +
      (note ? '<div class="ex-note">' + esc(note) + '</div>' : '') + '</div></div>' +
      (cfg.bySex || cfg.plain ? '' : '<div class="pn-geno">' + gtLine(g) + '</div>') +
      selects + '</div>';
  }

  function punnettHTML(key) {
    const cfg = PUNNETTS[key];
    const sg = gametes(cfg, 'sire');
    const dg = gametes(cfg, 'dam');
    const label = gm => cfg.genes.map(k => sym(k, gm[k])).join(' ');
    const share = 1 / (sg.length * dg.length);
    const xGene = cfg.genes.find(k => E.GENE[k].xLinked);
    const tally = new Map();
    const count = (k, look) => {
      const t = tally.get(k) || { key: k, look, p: 0 };
      t.p += share;
      tally.set(k, t);
    };
    let rows = '';
    for (const s of sg) {
      rows += '<tr><th scope="row" class="pn-gam">' + label(s) + '</th>';
      for (const d of dg) {
        // Genes not in the square are the same in both parents.
        const g = cloneGeno(cfg.sire);
        for (const k of cfg.genes) g[k] = [s[k], d[k]];
        const gt = cfg.genes.map(k => pairSym(k, g[k])).join(' ');
        if (cfg.bySex) {
          const ram = E.phenotypeOf(g, 'ram');
          const ewe = E.phenotypeOf(g, 'ewe');
          if (ram.horned) tally.set('ram', (tally.get('ram') || 0) + share);
          if (ewe.horned) tally.set('ewe', (tally.get('ewe') || 0) + share);
          const tag = look => '<span class="pn-horn">' + D.swatch(look, 'sm') + '<span class="tag">' + D.describe(look).hornTag + '</span></span>';
          rows += '<td><div class="pn-cell"><span class="pn-gt">' + gt + '</span>' + tag(ram) + tag(ewe) + '</div></td>';
        } else if (E.GENES.some(gene => gene.lethal && cfg.genes.includes(gene.key) && g[gene.key].every(a => a === gene.lethal))) {
          count('lost', null);
          rows += '<td><div class="pn-cell is-lost">' + D.emptySwatch('sm', 'Doesn\'t develop') + '<span class="pn-gt">' + gt + '</span>' +
            '<span class="pn-look">doesn\'t develop</span></div></td>';
        } else {
          // In an X-linked square, a Y from the ram makes a son.
          const sex = xGene && s[xGene] === null ? 'ram' : 'ewe';
          const look = E.phenotypeOf(g, sex);
          count((xGene ? sex + ':' : '') + D.title(look), look);
          const note = isDomBlack(g) && !isWhite(g) && agoutiPattern(g) !== 'solid' ? PATTERN_WORD[agoutiPattern(g)] + ' hidden' : '';
          rows += '<td><div class="pn-cell">' + D.swatch(look, 'sm') + '<span class="pn-gt">' + gt + '</span>' +
            '<span class="pn-look">' + (xGene ? D.sexIcon(sex) + ' ' : '') + esc(D.title(look)).replace('/', '/<wbr>') +
            (note ? '<br>(' + note + ')' : '') + '</span></div></td>';
        }
      }
      rows += '</tr>';
    }
    const head = '<tr><th class="pn-corner"><span>Ram ↓</span><span>Ewe →</span></th>' +
      dg.map(d => '<th scope="col" class="pn-gam">' + label(d) + '</th>').join('') + '</tr>';
    const out = (t, p) => '<span class="pn-out">' + (t.look ? D.swatch(t.look, 'xs') + esc(D.title(t.look)) : D.emptySwatch('xs') + 'Not born') +
      ' <b>' + pct(p) + '</b></span>';
    const byChance = [...tally.values()].sort((a, b) => b.p - a.p);
    let summary;
    if (cfg.bySex) {
      summary = ['ram', 'ewe'].map(sex => '<span class="pn-out"><b>' + (sex === 'ram' ? 'Ram lambs' : 'Ewe lambs') + '</b> ' + pct(tally.get(sex) || 0) + ' horned</span>').join('');
    } else if (xGene) {
      // Half the lambs are sons and half daughters, so show each sex out of its own half.
      summary = ['ewe', 'ram'].map(sex => '<span class="pn-sexline"><b>' + (sex === 'ram' ? 'Ram lambs' : 'Ewe lambs') + '</b>' +
        byChance.filter(t => t.key.startsWith(sex + ':')).map(t => out(t, t.p * 2)).join('') + '</span>').join('');
    } else {
      summary = byChance.map(t => out(t, t.p)).join('');
    }
    return '<div class="pn-parents">' + parentHTML(key, cfg, 'sire') + '<span class="pn-x">×</span>' + parentHTML(key, cfg, 'dam') + '</div>' +
      '<div class="pn-scroll"><table class="pn-grid">' + head + rows + '</table></div>' +
      '<div class="pn-summary"><span class="faint">Lambs</span>' + summary + '</div>';
  }

  function punnett(key, caption) {
    return '<figure class="punnett-fig"><div class="punnett" data-punnett="' + key + '"></div>' +
      (caption ? '<figcaption>' + caption + '</figcaption>' : '') + '</figure>';
  }

  // ------------------------------------------------------ gene cards

  function geneCard(gene, title, facts, examples, extra) {
    return '<div class="gene-card"><h3>' + title + '</h3>' +
      '<dl class="gene-facts">' + facts.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl>' +
      '<div class="ex-row">' + examples.join('') + '</div>' + (extra || '') + '</div>';
  }

  // ---------------------------------------------- what a look proves

  function provesHTML() {
    const L = (color, pattern, spotted) => ({ sex: 'ewe', color, pattern, spotted: !!spotted, horned: false });
    const sw = look => D.swatch(look, 'sm');
    const H = (sex, horned) => ({ sex, color: 'white', pattern: 'none', spotted: false, horned });
    const Ep2 = S.Ep + '/' + S.Ep;
    const group = name => '<tr class="group"><th colspan="3">' + name + '</th></tr>';
    const row = (look, name, proves, open) =>
      '<tr><td><span class="look">' + look + name + '</span></td><td>' + proves + '</td><td class="muted">' + open + '</td></tr>';
    return '<div class="pt-scroll"><table class="data proves"><thead><tr><th>It looks…</th><th>So it must have</th><th>Still unknown</th></tr></thead><tbody>' +
      group('Pattern') +
      row(sw(L('white', 'none')), 'White', 'At least one ' + S.Aw + '.', 'Everything else. Only its lambs can tell you.') +
      row(sw(L('black', 'badgerface')), 'Badgerface', S.Abf + ', plus ' + S.Abf + ' or ' + S.Aa + '. No dominant black: ' + Ep2 + '.', 'Whether its second agouti allele is ' + S.Abf + ' or ' + S.Aa + '.') +
      row(sw(L('black', 'mouflon')), 'Mouflon', S.Amf + ', plus ' + S.Amf + ' or ' + S.Aa + '. No dominant black: ' + Ep2 + '.', 'Whether its second agouti allele is ' + S.Amf + ' or ' + S.Aa + '.') +
      row(sw(L('black', 'mixed')), 'Badgerface/mouflon', S.Abf + '/' + S.Amf + ' and ' + Ep2 + '.', 'Nothing: you know both genes.') +
      row(sw(L('black', 'solid')), 'Solid', 'No ' + S.Aw + '. Then <b>either</b> at least one ' + S.ED + ' (agouti hidden), <b>or</b> ' + Ep2 + ' with ' + S.Aa + '/' + S.Aa + '.', 'Which of the two. See the example below.') +
      group('Shade and spots (any sheep that isn\'t white)') +
      row(sw(L('black', 'solid')), 'Black', 'At least one ' + S.B + '.', 'Whether it carries ' + S.b + '.') +
      row(sw(L('brown', 'solid')), 'Moorit', S.b + '/' + S.b + '.', 'Nothing.') +
      row(sw(L('black', 'solid')), 'No white patches', 'At least one ' + S.S + '.', 'Whether it carries ' + S.s + '.') +
      row(sw(L('black', 'solid', true)), 'White patches', S.s + '/' + S.s + '.', 'Nothing.') +
      group('Horns') +
      row(sw(H('ram', true)), D.sexIcon('ram') + ' Horned ram', 'At least one H.', 'Whether it carries P.') +
      row(sw(H('ram', false)), D.sexIcon('ram') + ' Polled ram', 'P/P.', 'Nothing.') +
      row(sw(H('ewe', true)), D.sexIcon('ewe') + ' Horned ewe', 'H/H.', 'Nothing.') +
      row(sw(H('ewe', false)), D.sexIcon('ewe') + ' Polled ewe', 'At least one P.', 'Whether it carries H.') +
      '</tbody></table></div>';
  }

  // ------------------------------------------------------ small tables

  function hornsTable() {
    return '<table class="data"><thead><tr><th>Horn alleles</th><th>In a ram</th><th>In a ewe</th></tr></thead><tbody>' +
      [['horned', 'horned'], ['horned', 'polled'], ['polled', 'polled']].map(p => {
        const g = geno({ horns: p });
        const cell = sex => { const look = E.phenotypeOf(g, sex); return '<span class="look-chip">' + D.swatch(look, 'sm') + D.describe(look).hornTag + '</span>'; };
        return '<tr><th scope="row">' + pairSym('horns', p) + '</th><td>' + cell('ram') + '</td><td>' + cell('ewe') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function booroolaTable() {
    const pairs = [['plus', 'plus'], ['carrier', 'plus'], ['carrier', 'carrier']];
    return '<table class="data boo-table"><thead><tr><th>Ewe</th><th>Single</th><th>Twins</th><th>Triplets</th><th>Average</th></tr></thead><tbody>' +
      E.LITTER_TABLE.map((p, copies) =>
        '<tr><th scope="row">' + pairSym('booroola', pairs[copies]) + ' <span class="muted">' + copies + (copies === 1 ? ' copy' : ' copies') + '</span></th>' +
        p.map(v => '<td><span class="hbar"><span style="width:' + v * 100 + '%"></span></span><span class="num">' + pct(v) + '</span></td>').join('') +
        '<td class="num"><b>' + (p[0] + 2 * p[1] + 3 * p[2]).toFixed(2) + '</b> lambs</td></tr>').join('') +
      '</tbody></table>';
  }

  function traitsTable() {
    return '<table class="data"><thead><tr><th>Trait</th><th>Breed average</th><th>Heritability</th></tr></thead><tbody>' +
      E.TRAITS.map(t => '<tr><th scope="row">' + t.name + '</th><td>' + t.mean + ' ' + t.unit +
        (t.hint ? ' <span class="muted">(' + t.hint + ')</span>' : '') + '</td><td>' + t.h2 + '</td></tr>').join('') +
      '</tbody></table>';
  }

  function runTable() {
    return '<table class="data"><thead><tr><th>Lambs in a row with no sign of it</th><th>Chance a carrier would do that</th></tr></thead><tbody>' +
      [1, 2, 3, 4, 5, 7].map(n => '<tr><td>' + n + '</td><td>' + pct(Math.pow(0.5, n)) + '</td></tr>').join('') + '</tbody></table>';
  }

  // ------------------------------------------------------ inbreeding

  function inbreedingDiagram() {
    const look = over => E.phenotypeOf(geno(over), 'ewe');
    const nodes = [
      { name: 'Ivy', sex: 'ewe', x: 14, y: 12, look: look({ agouti: ['white', 'solid'] }) },
      { name: 'Rowan', sex: 'ram', x: 50, y: 12, look: look({ agouti: ['badgerface', 'solid'] }), key: true },
      { name: 'Sorrel', sex: 'ewe', x: 86, y: 12, look: look({ brown: ['brown', 'brown'] }) },
      { name: 'Fern', sex: 'ewe', x: 30, y: 50, look: look({ agouti: ['white', 'badgerface'] }), key: true },
      { name: 'Moss', sex: 'ram', x: 70, y: 50, look: look({ agouti: ['badgerface', 'solid'] }), key: true },
      { name: 'Lamb', sex: 'ewe', x: 50, y: 88, look: look({ agouti: ['badgerface', 'badgerface'] }) },
    ];
    const at = n => nodes.find(o => o.name === n);
    const links = [['Ivy', 'Fern'], ['Rowan', 'Fern', 1], ['Rowan', 'Moss', 1], ['Sorrel', 'Moss'], ['Fern', 'Lamb', 1], ['Moss', 'Lamb', 1]];
    return '<div class="ped-diagram" role="img" aria-label="Rowan sired Fern and Moss with two different ewes. Fern and Moss are half-siblings, and their lamb is inbred.">' +
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + links.map(([a, b, hot]) =>
        '<line class="' + (hot ? 'hot' : '') + '" x1="' + at(a).x + '" y1="' + at(a).y + '" x2="' + at(b).x + '" y2="' + at(b).y + '" vector-effect="non-scaling-stroke"/>').join('') +
      '</svg>' +
      nodes.map(n => '<div class="pd-node' + (n.key ? ' key' : '') + '" style="left:' + n.x + '%;top:' + n.y + '%">' +
        D.swatch(n.look, 'sm') + '<span>' + n.name + ' ' + D.sexIcon(n.sex) + '</span></div>').join('') +
      '</div>';
  }

  // ------------------------------------------------- heritability chart

  function niceStep(span, target) {
    const raw = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
  }

  function chartHTML() {
    return '<div class="chart-card">' +
      '<div class="seg" role="group" aria-label="Fleece trait">' +
      E.TRAITS.map(t => '<button data-trait="' + t.key + '" aria-pressed="' + (t.key === chartTrait) + '">' + t.name + '</button>').join('') +
      '</div>' +
      '<div class="chart-title" id="chart-title"></div>' +
      '<div class="chart-wrap" id="chart-wrap"><svg class="chart-svg" id="chart-svg" viewBox="0 0 600 360" role="img"></svg>' +
      '<div class="chart-tip" id="chart-tip" hidden></div></div>' +
      '<p class="chart-note" id="chart-note"></p>' +
      '<details class="chart-table"><summary>Show the numbers</summary><div id="chart-table"></div></details>' +
      '</div>';
  }

  function drawChart(root, traitKey) {
    const { trait: t, families } = E.simulateFamilies(traitKey, 160, 11);
    const W = 600, H = 360;
    const m = { l: 52, r: 150, t: 14, b: 44 };
    const xs = families.map(f => f.parentAvg);
    const ys = families.map(f => f.lamb);
    const all = xs.concat(ys);
    const step = niceStep(Math.max(...all) - Math.min(...all), 6);
    const lo = Math.floor(Math.min(...all) / step) * step;
    const hi = Math.ceil(Math.max(...all) / step) * step;
    const px = v => m.l + (v - lo) / (hi - lo) * (W - m.l - m.r);
    const py = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);

    const mx = xs.reduce((a, b) => a + b) / xs.length;
    const my = ys.reduce((a, b) => a + b) / ys.length;
    let sxy = 0, sxx = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
    const slope = sxy / sxx;
    const fit = x => my + slope * (x - mx);

    let svg = '';
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const lab = Math.round(v * 10) / 10;
      svg += '<line class="grid" x1="' + px(lo) + '" x2="' + px(hi) + '" y1="' + py(v) + '" y2="' + py(v) + '"/>' +
        '<text class="tick" x="' + (m.l - 8) + '" y="' + (py(v) + 4) + '" text-anchor="end">' + lab + '</text>' +
        '<text class="tick" x="' + px(v) + '" y="' + (H - m.b + 18) + '" text-anchor="middle">' + lab + '</text>';
    }
    svg += '<line class="axis" x1="' + px(lo) + '" x2="' + px(hi) + '" y1="' + py(lo) + '" y2="' + py(lo) + '"/>' +
      '<text class="axis-label" x="' + ((m.l + W - m.r) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">Parents\' average (' + t.unit + ')</text>' +
      '<text class="axis-label" transform="translate(14 ' + ((m.t + H - m.b) / 2) + ') rotate(-90)" text-anchor="middle">Lamb (' + t.unit + ')</text>' +
      '<line class="ref" x1="' + px(lo) + '" y1="' + py(lo) + '" x2="' + px(hi) + '" y2="' + py(hi) + '"/>' +
      '<text class="line-label muted-label" x="' + (px(hi) + 6) + '" y="' + (py(hi) + 4) + '">if lambs matched</text>' +
      '<text class="line-label muted-label" x="' + (px(hi) + 6) + '" y="' + (py(hi) + 18) + '">their parents</text>';
    families.forEach((f, i) => {
      svg += '<circle class="dot" data-i="' + i + '" cx="' + px(f.parentAvg).toFixed(1) + '" cy="' + py(f.lamb).toFixed(1) + '" r="4"/>';
    });
    svg += '<line class="trend" x1="' + px(lo) + '" y1="' + py(fit(lo)) + '" x2="' + px(hi) + '" y2="' + py(fit(hi)) + '"/>' +
      '<text class="line-label" x="' + (px(hi) + 6) + '" y="' + (py(fit(hi)) + 4) + '">actual trend</text>' +
      '<text class="line-label muted-label" x="' + (px(hi) + 6) + '" y="' + (py(fit(hi)) + 18) + '">slope ≈ ' + slope.toFixed(2) + '</text>';

    const svgEl = root.querySelector('#chart-svg');
    svgEl.innerHTML = svg;
    svgEl.setAttribute('aria-label', 'Scatter of ' + families.length + ' simulated lambs: ' + t.name +
      ' of each lamb against its parents\' average. The trend slope is about ' + slope.toFixed(2) + '.');
    root.querySelector('#chart-title').innerHTML = '<b>' + t.name + '</b> · ' + families.length + ' made-up families · heritability ' + t.h2;

    const finer = t.key === 'diameter';
    const sorted = families.slice().sort((a, b) => (finer ? a.parentAvg - b.parentAvg : b.parentAvg - a.parentAvg));
    const top = sorted.slice(0, Math.round(families.length / 5));
    const pAvg = top.reduce((a, f) => a + f.parentAvg, 0) / top.length;
    const lAvg = top.reduce((a, f) => a + f.lamb, 0) / top.length;
    const short = top.filter(f => (finer ? f.lamb > f.parentAvg : f.lamb < f.parentAvg)).length;
    const word = { diameter: 'finest', staple: 'longest-stapled', crimp: 'crimpiest', luster: 'most lustrous' }[t.key];
    root.querySelector('#chart-note').textContent =
      'The ' + word + ' fifth of pairs averaged ' + pAvg.toFixed(1) + ' ' + t.unit + '. Their lambs averaged ' + lAvg.toFixed(1) + ' ' + t.unit +
      ': still better than the breed average of ' + t.mean + ', but pulled back toward it. ' + short + ' of ' + top.length +
      ' lambs fell short of their parents.';
    root.querySelector('#chart-table').innerHTML =
      '<table class="data"><thead><tr><th>Ram</th><th>Ewe</th><th>Parents\' average</th><th>Lamb</th></tr></thead><tbody>' +
      families.map(f => '<tr><td>' + f.sire.toFixed(1) + '</td><td>' + f.dam.toFixed(1) + '</td><td>' + f.parentAvg.toFixed(1) +
        '</td><td>' + f.lamb.toFixed(1) + '</td></tr>').join('') + '</tbody></table>';

    nearestTip(root, 'chart', families, f => [px(f.parentAvg), py(f.lamb)], W, H, f =>
      '<b>' + f.lamb.toFixed(1) + ' ' + t.unit + '</b> lamb<br><span>parents ' + f.sire.toFixed(1) + ' & ' +
      f.dam.toFixed(1) + ' (avg ' + f.parentAvg.toFixed(1) + ')</span>');
  }

  // Tooltip for the dot nearest the pointer. prefix names the chart's elements.
  function nearestTip(root, prefix, points, at, W, H, html) {
    const svgEl = root.querySelector('#' + prefix + '-svg');
    const tip = root.querySelector('#' + prefix + '-tip');
    const wrap = root.querySelector('#' + prefix + '-wrap');
    let active = null;
    svgEl.onpointermove = ev => {
      const box = svgEl.getBoundingClientRect();
      const sx = (ev.clientX - box.left) / box.width * W;
      const sy = (ev.clientY - box.top) / box.height * H;
      let best = -1, bestD = 18 * 18;
      points.forEach((f, i) => {
        const [x, y] = at(f);
        const dd = (x - sx) ** 2 + (y - sy) ** 2;
        if (dd < bestD) { bestD = dd; best = i; }
      });
      if (active) active.classList.remove('on');
      if (best < 0) { tip.hidden = true; active = null; return; }
      const f = points[best];
      const [x, y] = at(f);
      active = svgEl.querySelector('circle[data-i="' + best + '"]');
      active.classList.add('on');
      tip.innerHTML = html(f);
      tip.hidden = false;
      const wb = wrap.getBoundingClientRect();
      const left = x / W * box.width + (box.left - wb.left);
      const top2 = y / H * box.height + (box.top - wb.top);
      tip.style.left = Math.min(left + 12, wb.width - tip.offsetWidth - 4) + 'px';
      tip.style.top = Math.max(0, top2 - tip.offsetHeight - 10) + 'px';
    };
    svgEl.onpointerleave = () => { tip.hidden = true; if (active) active.classList.remove('on'); active = null; };
  }

  // ------------------------------------------------------ gilded chart

  function gildChartHTML() {
    return '<div class="chart-card">' +
      '<div class="chart-title"><b>Gilded</b> · 200 made-up families · heritability ' + E.LIABILITIES[0].h2 + '</div>' +
      '<div class="chart-legend"><span><i class="lg-gold"></i>Gilded lamb</span><span><i class="lg-plain"></i>Not gilded</span></div>' +
      '<div class="chart-wrap" id="gild-wrap"><svg class="chart-svg" id="gild-svg" viewBox="0 0 600 360" role="img"></svg>' +
      '<div class="chart-tip" id="gild-tip" hidden></div></div>' +
      '<p class="chart-note" id="gild-note"></p>' +
      '<details class="chart-table"><summary>Show the numbers</summary><div id="gild-table"></div></details>' +
      '</div>';
  }

  function drawGildChart(root) {
    const { liability: l, families } = E.simulateGildFamilies(200, 9);
    const W = 600, H = 360;
    const m = { l: 52, r: 150, t: 14, b: 44 };
    const all = families.map(f => f.parentAvg).concat(families.map(f => f.lamb));
    const lo = Math.floor(Math.min(...all));
    const hi = Math.ceil(Math.max(...all));
    const px = v => m.l + (v - lo) / (hi - lo) * (W - m.l - m.r);
    const py = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);
    const xs = families.map(f => f.parentAvg);
    const ys = families.map(f => f.lamb);
    const mx = xs.reduce((a, b) => a + b) / xs.length;
    const my = ys.reduce((a, b) => a + b) / ys.length;
    let sxy = 0, sxx = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
    const slope = sxy / sxx;
    const fit = x => my + slope * (x - mx);

    let svg = '';
    for (let v = lo; v <= hi; v++) {
      svg += '<line class="grid" x1="' + px(lo) + '" x2="' + px(hi) + '" y1="' + py(v) + '" y2="' + py(v) + '"/>' +
        '<text class="tick" x="' + (m.l - 8) + '" y="' + (py(v) + 4) + '" text-anchor="end">' + v + '</text>' +
        '<text class="tick" x="' + px(v) + '" y="' + (H - m.b + 18) + '" text-anchor="middle">' + v + '</text>';
    }
    svg += '<line class="axis" x1="' + px(lo) + '" x2="' + px(hi) + '" y1="' + py(lo) + '" y2="' + py(lo) + '"/>' +
      '<text class="axis-label" x="' + ((m.l + W - m.r) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">Parents\' average score</text>' +
      '<text class="axis-label" transform="translate(14 ' + ((m.t + H - m.b) / 2) + ') rotate(-90)" text-anchor="middle">Lamb\'s score</text>' +
      '<line class="cut" x1="' + px(lo) + '" x2="' + px(hi) + '" y1="' + py(l.threshold) + '" y2="' + py(l.threshold) + '"/>' +
      '<text class="line-label halo" x="' + (px(lo) + 8) + '" y="' + (py(l.threshold) - 8) + '">Gilded above this line</text>';
    families.forEach((f, i) => {
      svg += '<circle class="dot' + (f.gilded ? ' gold' : '') + '" data-i="' + i + '" cx="' + px(f.parentAvg).toFixed(1) + '" cy="' + py(f.lamb).toFixed(1) + '" r="4"/>';
    });
    svg += '<line class="trend" x1="' + px(lo) + '" y1="' + py(fit(lo)) + '" x2="' + px(hi) + '" y2="' + py(fit(hi)) + '"/>' +
      '<text class="line-label" x="' + (px(hi) + 6) + '" y="' + (py(fit(hi)) + 4) + '">actual trend</text>' +
      '<text class="line-label muted-label" x="' + (px(hi) + 6) + '" y="' + (py(fit(hi)) + 18) + '">slope ≈ ' + slope.toFixed(2) + '</text>';

    const svgEl = root.querySelector('#gild-svg');
    svgEl.innerHTML = svg;
    const gilded = families.filter(f => f.gilded).length;
    svgEl.setAttribute('aria-label', 'Scatter of ' + families.length + ' made-up lambs: each lamb\'s hidden score against its parents\' average. ' +
      gilded + ' lambs score above the cutoff of ' + l.threshold + ' and are gilded.');

    const sorted = families.slice().sort((a, b) => b.parentAvg - a.parentAvg);
    const fifth = Math.round(families.length / 5);
    const rate = list => Math.round(list.filter(f => f.gilded).length / list.length * 100);
    root.querySelector('#gild-note').textContent =
      'Lambs of the highest-scoring fifth of pairs were ' + rate(sorted.slice(0, fifth)) + '% gilded; lambs of the lowest fifth, ' +
      rate(sorted.slice(-fifth)) + '%. In your flock the scores are hidden: you only see who\'s gilded.';
    root.querySelector('#gild-table').innerHTML =
      '<table class="data"><thead><tr><th>Ram</th><th>Ewe</th><th>Parents\' average</th><th>Lamb</th><th>Gilded?</th></tr></thead><tbody>' +
      families.map(f => '<tr><td>' + f.sire.toFixed(2) + '</td><td>' + f.dam.toFixed(2) + '</td><td>' + f.parentAvg.toFixed(2) +
        '</td><td>' + f.lamb.toFixed(2) + '</td><td>' + (f.gilded ? 'Yes' : 'No') + '</td></tr>').join('') + '</tbody></table>';
    nearestTip(root, 'gild', families, f => [px(f.parentAvg), py(f.lamb)], W, H, f =>
      '<b>Score ' + f.lamb.toFixed(2) + '</b> ' + (f.gilded ? 'gilded lamb' : 'lamb, not gilded') + '<br><span>parents ' +
      f.sire.toFixed(2) + ' & ' + f.dam.toFixed(2) + ' (avg ' + f.parentAvg.toFixed(2) + ')</span>');
  }

  // ------------------------------------------------------ fantasy section

  function fantasyTable() {
    const white = { agouti: ['white', 'solid'] };
    const rows = [
      ['g-dilution', 'Dilution', 'Incomplete dominance', fchip({ dilution: ['full', 'dilute'] }, 'Dusk') + fchip({ dilution: ['dilute', 'dilute'] }, 'Frost')],
      ['g-hue', 'Hue', 'Codominance', fchip({ hue: ['rose', 'rose'] }, 'Rose') + fchip({ hue: ['rose', 'blue'] }, 'Violet') + fchip({ hue: ['blue', 'blue'] }, 'Blue')],
      withOpal && ['g-opal', 'Opal', 'Sex linkage', fchip(Object.assign({ opal: ['opal', 'plain'] }, white), 'Patchy') + fchip(Object.assign({ opal: ['opal', 'opal'] }, white), 'Opal')],
      ['g-speckle', 'Speckle', 'Mutation', fchip({ speckle: ['speckled', 'speckled'] }, 'Speckled')],
      ['g-lantern', 'Lantern', 'Lethal allele', fchip({ lantern: ['glow', 'plain'] }, 'Glowing')],
      ['g-gilded', 'Gilded', 'Threshold trait', fchip(white, 'Gilded', { look: { gilded: true } })],
    ].filter(Boolean);
    return '<div class="pt-scroll"><table class="data fantasy-table"><thead><tr><th>Gene</th><th>How it works</th><th>Looks</th></tr></thead><tbody>' +
      rows.map(([id, name, how, looks]) => '<tr><th scope="row"><a href="#' + id + '">' + name + '</a></th><td>' + how + '</td><td><span class="finish-ex">' +
        looks + '</span></td></tr>').join('') + '</tbody></table></div>';
  }

  // One worked example per gene: swatch, title and that gene's alleles.
  function fex(over, genes, extra) {
    const g = fgeno(over);
    const look = Object.assign(E.phenotypeOf(g, (extra && extra.sex) || 'ewe'), extra && extra.look);
    return '<figure class="ex">' + D.swatch(look, 'lg') + '<figcaption><b>' + esc(D.title(look)) + '</b>' +
      (genes.length ? '<span class="gt-line">' + genes.map(k => '<span class="gt-gene">' + pairSym(k, g[k]) + '</span>').join('') + '</span>' : '') +
      (extra && extra.note ? '<span class="ex-note">' + esc(extra.note) + '</span>' : '') + '</figcaption></figure>';
  }

  // Dev only: shown when the flock has Opal.
  function opalHTML(white) {
    return '<h3 id="g-opal">Opal: sex linkage</h3>' +
      '<p>Opal sits on the X chromosome. A ewe has two X chromosomes; a ram has one X and one Y, and the Y has no Opal gene at all. ' +
      'So a ram shows whatever his one X carries, while a ewe with one ' + F.XO + ' is <b>patchy</b> and a ewe with two is fully opal.</p>' +
      '<div class="ex-row">' + fex(Object.assign({ opal: [null, 'opal'] }, white), ['opal'], { sex: 'ram', note: 'ram: one X' }) +
      fex(Object.assign({ opal: ['opal', 'plain'] }, white), ['opal']) + fex(Object.assign({ opal: ['opal', 'opal'] }, white), ['opal']) + '</div>' +
      '<p>A ram passes his X to every daughter and his Y to every son. So <b>sons get their opal only from their dam</b>, ' +
      'and a ram\'s opal skips a generation through his daughters. In your notes, a ram has one Opal slot; the other shows Y.</p>' +
      punnett('opal', 'A plain ram and a patchy ewe: half their sons are opal, from her. Try making the ram opal: his daughters change, his sons don\'t.');
  }

  function fantasyHTML() {
    const l = E.LIABILITIES[0];
    const odds = Math.round(1 / E.SPECKLE_MUTATION_RATE);
    const white = { agouti: ['white', 'white'] };
    const pair = (a, b) => a + '/' + b;
    return '<p>None of these genes exist in real sheep. Each one is a small, made-up example of a real way genes can behave. ' +
      'They only appear in flocks started with <b>Include fantasy genes</b>, and they work on top of the real color genes without changing them.</p>' +
      fantasyTable() +

      '<h3 id="g-dilution">Dilution: incomplete dominance</h3>' +
      '<p>Neither allele fully wins. One ' + F.d + ' lightens the dark color to <b>dusk</b>, and two make it <b>frost</b>. ' +
      'So a sheep\'s shade gives away both its alleles. Only the dark color changes: the light parts of badgerface and mouflon stay the same, ' +
      'and a white sheep hides dilution completely.</p>' +
      '<div class="ex-row">' + fex({ agouti: ['badgerface', 'solid'] }, ['dilution']) +
      fex({ agouti: ['badgerface', 'solid'], dilution: ['full', 'dilute'] }, ['dilution']) +
      fex({ agouti: ['badgerface', 'solid'], dilution: ['dilute', 'dilute'] }, ['dilution']) + '</div>' +
      punnett('dilution', 'Two dusk parents: 1 full : 2 dusk : 1 frost. Every lamb\'s shade shows its genotype.') +

      '<h3 id="g-hue">Hue: codominance, and hiding Brown</h3>' +
      '<p>Rose (' + F.Hr + ') and blue (' + F.Hb + ') are recessive to normal (' + F.Hp + '), so a sheep needs two of them to show any hue. ' +
      'With one of each, neither hides the other and it shows both at once: <b>violet</b>.</p>' +
      '<p>A hue replaces the dark color completely, so it hides Brown: a rose sheep could be ' + pair(S.B, S.B) + ' or ' + pair(S.b, S.b) + '. ' +
      'Both parents below are moorit underneath (' + pair(S.b, S.b) + '), yet no lamb is moorit. Switch a parent to ' + pair(F.Hp, F.Hp) +
      ' and the moorit comes back.</p>' +
      punnett('hue', 'Two violet parents: 1 rose : 2 violet : 1 blue.') +

      (withOpal ? opalHTML(white) : '') +

      '<h3 id="g-speckle">Speckle: mutation</h3>' +
      '<p>' + F.st + ' is recessive, like spotting: ' + pair(F.st, F.st) + ' sheep have tiny gold speckles. What\'s new is that a normal ' + F.St +
      ' sometimes changes into ' + F.st + ' as it\'s passed on, about 1 time in ' + odds + '.</p>' +
      '<p>So now and then a speckled lamb turns up from parents that can\'t give it two ' + F.st + ' alleles, and that isn\'t always a mistake in your notes. ' +
      'Predictions leave mutations out. If one new mutation would explain a lamb, the surprise check marks it <b>rare</b> instead of impossible.</p>' +
      punnett('speckle', 'Two carriers: one lamb in four is speckled, not counting new mutations.') +

      '<h3 id="g-lantern">Lantern: a lethal allele</h3>' +
      '<p>One ' + F.L + ' makes a sheep glow. Two are lethal: an ' + pair(F.L, F.L) + ' lamb doesn\'t develop and is never born. ' +
      'So every glowing sheep is ' + pair(F.L, F.Lp) + ', and every plain one is ' + pair(F.Lp, F.Lp) + '.</p>' +
      '<p>Two glowing parents lose about a quarter of their lambs. Of the lambs that are born, about 2 glow for every 1 that doesn\'t, ' +
      'instead of the 3 : 1 you\'d expect from a dominant allele, and litters are smaller. A sheep\'s litter history shows lambs that didn\'t develop.</p>' +
      punnett('lantern', 'Two glowing parents: of every four lambs conceived, two glow, one is plain and one doesn\'t develop.') +

      '<h3 id="g-gilded">Gilded: a threshold trait</h3>' +
      '<p>Gilded isn\'t one gene. Like fleece, it comes from a hidden score built from many genes plus luck, with a heritability of ' + l.h2 + '. ' +
      'The difference is that you never see the score, only whether it passed a cutoff: a sheep is gilded if its score is above ' + l.threshold +
      ', which about 1 sheep in 6 manage. It shows as a gold ring around the swatch.</p>' +
      '<p>Gilded parents tend to have high scores, so their lambs are gilded more often, but most of their lambs still aren\'t. ' +
      'Each dot is one made-up lamb, placed by its parents\' average score and its own.</p>' +
      gildChartHTML() +
      '<p>There\'s no notes row for gilded and it never raises a surprise flag: with many genes and some luck, any lamb can go either way. ' +
      'The breeding pen shows each pairing\'s chance, worked out from which parents and ancestors are gilded.</p>';
  }

  // ------------------------------------------------------------- page

  const FANTASY_SECTION = ['g-fantasy', 'Fantasy genes (made up)'];
  const SECTIONS = [
    ['g-basics', 'The basics'],
    ['g-color', 'How coat color works'],
    ['g-genes', 'The color genes one by one'],
    ['g-horns', 'Horns and sex'],
    ['g-booroola', 'Booroola'],
    ['g-fleece', 'Fleece and heritability'],
    ['g-inbreeding', 'Inbreeding'],
    ['g-detective', 'Detective work'],
  ];

  function section(i, body, list) {
    const [id, title] = (list || SECTIONS)[i];
    return '<section id="' + id + '"><h2><span class="num-badge">' + (i + 1) + '</span>' + title + '</h2>' + body + '</section>';
  }

  function pageHTML(fantasy) {
    const sections = fantasy ? SECTIONS.concat([FANTASY_SECTION]) : SECTIONS;
    const pen10 = E.INBREEDING_FLEECE_PENALTY * 0.1;
    const diam = E.TRAIT.diameter;

    const basics =
      '<p>A <b>gene</b> is an instruction for one trait, like coat color. Every sheep has <b>two copies</b> of each gene: ' +
      'one from its sire (father) and one from its dam (mother).</p>' +
      '<p>Genes come in versions called <b>alleles</b>. Each allele here has a short symbol, like ' + S.S + ' for normal and ' + S.s +
      ' for spotted. A sheep\'s pair is written with a slash: ' + S.S + '/' + S.s + ' means one of each.</p>' +
      '<p>A parent passes on <b>one</b> of its two copies, picked at random like a coin toss. Every lamb gets a fresh toss, so littermates can differ.</p>' +
      '<div class="key"><b>Hiding, part 1: dominant and recessive.</b> A <b>dominant</b> allele shows with just one copy. ' +
      'A <b>recessive</b> allele only shows with two. A sheep with one recessive copy looks normal but <b>carries</b> it, and can pass it on.</div>' +
      '<p>A <b>Punnett square</b> lists every possible lamb. Each parent\'s two alleles go along the edges, and each cell is one equally likely lamb. ' +
      'Here both parents are ' + S.S + '/' + S.s + ': unspotted, but carrying spotting. One lamb in four gets ' + S.s + ' from both and is spotted. ' +
      'Try changing the dropdowns.</p>' +
      punnett('spotting', 'Spotting: ' + S.S + ' (normal) is dominant over ' + S.s + ' (spotted).');

    const color =
      '<p>Four genes decide a sheep\'s coat. They\'re confusing at first because they don\'t each control a separate thing: ' +
      'some genes can cover up others. It helps to give each one a job.</p>' +
      '<div class="jobs">' +
      '<div><b>Brown</b><span>picks the dark color: black or moorit (brown).</span></div>' +
      '<div><b>Agouti</b><span>decides where the dark color goes: the pattern. One of its alleles, white, removes color altogether.</span></div>' +
      '<div><b>Extension</b><span>can overrule agouti. Its dominant black allele (' + S.ED + ') puts dark color everywhere.</span></div>' +
      '<div><b>Spotting</b><span>adds white patches on top.</span></div>' +
      '</div>' +
      '<p>Your sheep show you their looks, not their genes. To read a sheep, ask these questions in order. ' +
      'Each answer tells you something certain about its genes, and what\'s still hidden.</p>' +
      flowHTML(fantasy) +
      '<div class="key"><b>Hiding, part 2: one gene covering another.</b> White covers every other color gene, and dominant black covers the agouti pattern. ' +
      'A covered-up gene is still there and still gets passed on. A solid black sheep may carry badgerface; a white sheep may carry anything. ' +
      'In this guide, <span class="gt-gene hid">greyed genotypes</span> are genes a sheep has but doesn\'t show.</div>' +

      '<h3>Agouti and Extension side by side</h3>' +
      '<p>Agouti and Extension both affect the pattern, so it\'s easiest to see them together. Each row is a pair of agouti alleles; ' +
      'the columns are without and with dominant black. Switch Brown to see the same table in moorit.</p>' +
      '<div class="ptable-card" id="ptable">' + ptableHTML() + '</div>' +
      '<p>Look down the right-hand column: with dominant black, every sheep that isn\'t white looks the same, whatever its agouti alleles. ' +
      'That\'s why you can\'t read a solid sheep\'s agouti from its looks. Brown never changes the pattern, only the shade.</p>' +

      '<h3>Build a sheep</h3>' +
      '<p>This goes the other way: pick any alleles and see how the sheep would look, step by step. ' +
      'It starts as a black sheep hiding a badgerface pattern. ' +
      'Try switching its Extension to ' + S.Ep + '/' + S.Ep + '.</p>' +
      '<div class="builder" id="builder">' + builderHTML() + '</div>' +

      '<h3>Why two white parents can have a black lamb</h3>' +
      '<p>White is dominant, so a white sheep can carry another agouti allele underneath. Both parents here are ' + S.Aw + '/' + S.Aa + '. ' +
      'A lamb that gets ' + S.Aa + ' from both has no white allele, so its real color shows. Their other color genes are plain ' +
      '(' + S.Ep + '/' + S.Ep + ', ' + S.B + '/' + S.B + ', ' + S.S + '/' + S.S + '), so that lamb is black.</p>' +
      punnett('whiteWhite', 'Try giving one parent two white alleles: then every lamb gets a white allele, and none are colored.');

    const genes =
      '<p>A closer look at each color gene: its alleles, what it looks like, and what can hide it.</p>' +
      geneCard('agouti', 'Agouti: the pattern', [
        ['Alleles', S.Aw + ' white &gt; ' + S.Abf + ' badgerface = ' + S.Amf + ' mouflon &gt; ' + S.Aa + ' solid'],
        ['Shows as', 'White, or a pattern: badgerface is light on top and dark below, mouflon is the reverse.'],
        ['Hidden by', 'Dominant black hides badgerface and mouflon. Nothing hides white.'],
        ['Real sheep', 'Most white breeds, like the Merino, are white because of agouti white. Badger Face Welsh Mountain sheep are badgerface. ' +
          'Wild mouflon and Soay sheep have the mouflon pattern.'],
      ], [
        ex({ agouti: ['white', 'solid'] }), ex({ agouti: ['badgerface', 'solid'] }), ex({ agouti: ['mouflon', 'mouflon'] }),
        ex({ agouti: ['badgerface', 'mouflon'] }), ex({ agouti: ['solid', 'solid'] }),
      ],
      '<p>Badgerface and mouflon are <b>codominant</b>: neither hides the other, so a sheep with one of each shows both. ' +
      'Here a badgerface ram and a mouflon ewe, both carrying solid, can have four different-looking lambs.</p>' + punnett('agouti')) +

      geneCard('extension', 'Extension: the override', [
        ['Alleles', S.ED + ' dominant black &gt; ' + S.Ep + ' normal'],
        ['Shows as', 'One ' + S.ED + ' makes the sheep solid. ' + S.Ep + '/' + S.Ep + ' does nothing, leaving the pattern to agouti.'],
        ['Hidden by', 'White.'],
        ['Real sheep', 'Dominant black turns up in breeds such as the Karakul.'],
      ], [
        ex({ agouti: ['badgerface', 'badgerface'] }), ex({ agouti: ['badgerface', 'badgerface'], extension: ['black', 'normal'] }),
        ex({ agouti: ['badgerface', 'badgerface'], extension: ['black', 'black'] }),
      ],
      '<p>The ram below is solid black, but his agouti is badgerface: dominant black is hiding it. The ewe is badgerface. ' +
      'Half their lambs get his ' + S.ED + ' and come out solid. The other half get his ' + S.Ep + ' and show the badgerface they all carry.</p>' +
      punnett('extension')) +

      geneCard('brown', 'Brown: the shade', [
        ['Alleles', S.B + ' normal &gt; ' + S.b + ' brown'],
        ['Shows as', 'Two ' + S.b + ' turn every dark part moorit, on solid and patterned sheep alike. It never changes the pattern.'],
        ['Hidden by', 'White.'],
        ['Real sheep', 'Moorit is the Shetland name for this reddish brown.'],
      ], [
        ex({ brown: ['normal', 'brown'] }, { note: 'carries b' }), ex({ brown: ['brown', 'brown'] }),
        ex({ agouti: ['mouflon', 'solid'], brown: ['brown', 'brown'] }),
      ], punnett('brown', 'Two black carriers: one lamb in four is moorit.')) +

      geneCard('spotting', 'Spotting: white patches', [
        ['Alleles', S.S + ' normal &gt; ' + S.s + ' spotted'],
        ['Shows as', 'Two ' + S.s + ' add white patches, shown as a white dot on the swatch.'],
        ['Hidden by', 'White. Patches don\'t show on a white sheep, so its spotting stays a mystery until its lambs reveal it.'],
        ['Real sheep', 'Jacob sheep are the best-known spotted breed.'],
      ], [
        ex({ spotting: ['normal', 'spotted'] }, { note: 'carries s' }), ex({ spotting: ['spotted', 'spotted'] }),
        ex({ agouti: ['badgerface', 'solid'], spotting: ['spotted', 'spotted'] }),
      ], '<p>Its Punnett square is the one in <a href="#g-basics">The basics</a>.</p>');

    const horns =
      '<p>The horn gene is <b>sex-influenced</b>: the same alleles look different in a ram and a ewe. ' +
      'Horned (H) acts dominant in rams and recessive in ewes, so one copy gives a ram horns but leaves a ewe polled (hornless).</p>' +
      hornsTable() +
      '<p>This is why, in many breeds, rams grow horns and ewes don\'t. It also means a polled ewe can carry horns, and a horned ram can carry polled.</p>' +
      punnett('horns', 'Two carriers: three in four ram lambs are horned, but only one in four ewe lambs.');

    const booroola =
      '<p>Booroola was found in a flock of Merinos at the Booroola stud in Australia. It makes ewes release more eggs, so litters get bigger. ' +
      'It\'s <b>additive</b>: there\'s no dominance, and each copy adds a bit more.</p>' +
      booroolaTable() +
      '<p>Only ewes show it, since rams don\'t have litters. A ram can still carry Booroola and pass it to his daughters, so watch their litters. ' +
      'Litter size is also partly luck, so judge a ewe on several litters, not one.</p>';

    const fleece =
      '<p>Fleece isn\'t controlled by one gene but by many, each nudging it a little. On top of that comes the environment: feed, weather and luck. ' +
      'So fleece is measured as a number, not sorted into types.</p>' +
      '<p>Each sheep has a hidden <b>genetic value</b> for each trait. A lamb gets its parents\' average plus a random reshuffle, ' +
      'and what you measure is that value plus some noise. <b>Heritability</b> is how much of the difference between sheep comes from genes: ' +
      'at 0.6, a bit more than half.</p>' +
      traitsTable() +
      '<p>So fine-fiber parents usually, but not always, have fine-fiber lambs. Each dot below is one made-up lamb, placed by its parents\' average ' +
      'and its own measurement. If fleece were fully inherited, the dots would sit on the diagonal. Instead they scatter around a flatter trend: ' +
      'lambs of extreme parents drift back toward the breed average.</p>' +
      chartHTML();

    const inbreeding =
      '<p>When parents are related, a lamb can get two copies of the <b>same</b> ancestor\'s allele. The <b>inbreeding coefficient</b> ' +
      'is the chance of that for any one gene, worked out from the pedigree.</p>' +
      '<p>Here, Rowan sired Fern and Moss with two different ewes, so Fern and Moss are half-siblings. Fern passes on the allele she got ' +
      'from Rowan half the time, and so does Moss. When both do, there\'s a 50% chance it\'s the same one of Rowan\'s two copies. ' +
      'That gives ½ × ½ × ½ = <b>12.5%</b>.</p>' +
      inbreedingDiagram() +
      '<p>Two numbers describe this. <b>Relatedness</b> is the share of genes two sheep have in common by descent: about half for ' +
      'full siblings. A lamb\'s <b>inbreeding</b> is half its parents\' relatedness, when the parents aren\'t inbred themselves. ' +
      'When you pick a mate in the flock, each candidate shows how related it is.</p>' +
      '<table class="data"><thead><tr><th>Parents are…</th><th>Related</th><th>Lamb\'s inbreeding</th></tr></thead><tbody>' +
      [['Unrelated', '0%', '0%'], ['First cousins', '12.5%', '6.25%'], ['Half-siblings', '25%', '12.5%'], ['Full siblings', '50%', '25%'],
        ['Parent and offspring', '50%', '25%'], ['Full siblings, two generations running', '60%', '37.5%']]
        .map(([who, rel, F]) => '<tr><td>' + who + '</td><td>' + rel + '</td><td>' + F + '</td></tr>').join('') + '</tbody></table>' +
      '<p>Inbreeding brings hidden recessives into the open, which helps detective work, but it has a cost. In this sandbox, every 10% of inbreeding ' +
      'pushes each fleece measurement about ' + pen10.toFixed(2) + ' standard deviations the wrong way (about ' + (pen10 * diam.sd).toFixed(1) + ' ' +
      diam.unit + ' coarser fiber) and makes an inbred ewe ' + Math.round(E.INBREEDING_LITTER_PENALTY * 10) + '% less likely to have twins or triplets.</p>';

    const detective =
      '<h3>What a sheep\'s look proves</h3>' +
      '<p>The same reading as in <a href="#g-color">How coat color works</a>, plus horns, as a quick reference for your notes. ' +
      'Anything in the middle column is safe to mark as <b>sure</b>. When it says a sheep has no allele, like "no ' + S.Aw + '", ' +
      'rule that allele out in the <b>Doesn\'t have</b> row of your notes.</p>' +
      provesHTML() +

      '<h3>Example: a solid black ewe</h3>' +
      '<div class="worked">' +
      ex({ extension: ['black', 'normal'], spotting: ['spotted', 'spotted'] }, { note: 'genotype unknown', noGenotype: true }) +
      '<p>She\'s solid, so one of two stories is true, and her looks can\'t tell you which:</p></div>' +
      '<div class="stories">' +
      '<div class="story"><div class="story-head">Story 1: dominant black</div>' +
      '<p>She has at least one ' + S.ED + '. Her agouti could be anything except white; it\'s hidden.</p>' +
      '<span class="gt-line"><span class="gt-gene hid">?/?</span><span>' + S.ED + '/?</span><span>' + S.B + '/?</span><span>' + S.s + '/' + S.s + '</span></span></div>' +
      '<div class="story"><div class="story-head">Story 2: no dominant black</div>' +
      '<p>She\'s ' + S.Ep + '/' + S.Ep + '. Then the only way to be solid is ' + S.Aa + '/' + S.Aa + '.</p>' +
      '<span class="gt-line"><span>' + S.Aa + '/' + S.Aa + '</span><span>' + S.Ep + '/' + S.Ep + '</span><span>' + S.B + '/?</span><span>' + S.s + '/' + S.s + '</span></span></div>' +
      '</div>' +
      '<p>In your notes, that\'s: under Agouti, rule out ' + S.Aw + '. Mark one ' + S.B + ' and both ' + S.s + ' as sure, and leave Extension as ?/?. ' +
      'Predictions then know she can\'t pass on white.</p>' +
      '<p>To find out which story is true, breed her to a badgerface or mouflon ram. A patterned ram can\'t have dominant black, or he\'d be solid.</p>' +
      '<ul class="tips">' +
      '<li><b>Story 2:</b> every lamb gets ' + S.Ep + ' from both parents, so each one shows whatever agouti allele the ram passes on.</li>' +
      '<li><b>Story 1:</b> lambs that get her ' + S.ED + ' come out solid, whatever the ram passes on. With a ram you think is ' +
      S.Abf + '/' + S.Abf + ', a single solid lamb proves story 1.</li>' +
      '<li>A lamb showing a pattern the ram can\'t give, like a mouflon lamb from that ' + S.Abf + '/' + S.Abf + ' ram, also proves story 1: ' +
      'the pattern came from her hidden agouti.</li></ul>' +

      '<h3>Test-breeding a white ram</h3>' +
      '<p>A white ram could be hiding anything. Breed him to solid ewes, which have no white allele. If he\'s ' + S.Aw + '/' + S.Aw +
      ', every lamb is white. If he carries another agouti allele, about half his lambs show it, and their pattern tells you which one.</p>' +
      punnett('testCross', 'Change the ram\'s second allele to see what each hidden allele would look like in his lambs.') +
      '<p>One white lamb doesn\'t prove much: a carrier passes on his white allele half the time. It takes a run of them:</p>' +
      runTable() +

      '<h3>More tips</h3>' +
      '<ul class="tips">' +
      '<li><b>One lamb can prove a lot.</b> A colored lamb from two white parents proves both carry a non-white agouti allele. ' +
      'A moorit lamb proves both parents carry ' + S.b + '.</li>' +
      '<li><b>Use sheep that show a recessive.</b> A moorit or spotted sheep has two copies, so you know exactly what it passes on.</li>' +
      '<li><b>Horned ewes and polled rams are known quantities.</b> Each must have two matching horn alleles, which makes them good testers.</li>' +
      '<li><b>Judge rams by their daughters.</b> Booroola never shows in a ram, so watch his daughters\' litters.</li>' +
      '<li><b>Fleece needs many lambs.</b> One coarse lamb from fine parents is bad luck. Judge on the average.</li>' +
      '<li><b>Mark guesses sure only when they\'re proven.</b> Keep the rest as hunches. When a lamb doesn\'t fit your notes, ' +
      'a surprise flag names the guess to re-check.</li></ul>';

    return '<div class="guide">' +
      '<nav class="guide-toc" aria-label="Guide sections"><div class="toc-title">Genetics guide</div><ol>' +
      sections.map(([id, t]) => '<li><a href="#' + id + '">' + t + '</a></li>').join('') + '</ol></nav>' +
      '<article class="guide-body">' +
      '<header class="guide-head"><h1>How sheep genetics works</h1>' +
      '<p class="lede">Everything you need to work out what your sheep are hiding. The sheep on this page are made-up examples; ' +
      'it never looks at your flock.' + (fantasy ? ' Your flock has fantasy genes, so the last section covers those.' : '') + '</p></header>' +
      section(0, basics) + section(1, color) + section(2, genes) + section(3, horns) +
      section(4, booroola) + section(5, fleece) + section(6, inbreeding) + section(7, detective) +
      (fantasy ? section(8, fantasyHTML(), sections)
        : '<aside class="invite guide-invite"><b>Ready for more?</b> <span>Fantasy genes add five made-up genes on top of the real ones. ' +
          'Each shows a real way genes behave that sheep color doesn\'t: incomplete dominance, codominance, mutation, a lethal allele ' +
          'and a threshold trait. Start a fantasy flock and this guide gains a section on them.</span>' +
          '<button class="btn btn-small" data-act="try-fantasy">Start a fantasy flock</button></aside>') +
      '</article></div>';
  }

  // ------------------------------------------------------------ mount

  function mountPunnett(el) { el.innerHTML = punnettHTML(el.dataset.punnett); }

  // Re-render a widget, keeping focus on the control that changed.
  function rerender(el, html, changed) {
    const sel = changed && changed.tagName === 'SELECT'
      ? 'select' + [...changed.attributes].filter(a => a.name.startsWith('data-')).map(a => '[' + a.name + '="' + a.value + '"]').join('')
      : null;
    el.innerHTML = html;
    if (sel) {
      const again = el.querySelector(sel);
      if (again) again.focus({ preventScroll: true });
    }
  }

  // Builds the page, and rebuilds it when the flock's genes change.
  function render(container, opts) {
    const fantasy = !!(opts && opts.fantasy);
    const kind = fantasy ? ((opts && opts.genes) || []).join() : 'base';
    if (mounted === kind) return;
    const first = mounted === null;
    mounted = kind;
    withOpal = fantasy && !!(opts && opts.genes && opts.genes.includes('opal'));
    container.innerHTML = pageHTML(fantasy);
    container.querySelectorAll('[data-punnett]').forEach(mountPunnett);
    drawChart(container, chartTrait);
    if (fantasy) drawGildChart(container);
    if (!first) return;

    container.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('select[data-pn]')) {
        PUNNETTS[t.dataset.pn][t.dataset.parent][t.dataset.gene][+t.dataset.i] = t.value;
        const el = container.querySelector('[data-punnett="' + t.dataset.pn + '"]');
        rerender(el, punnettHTML(t.dataset.pn), t);
      } else if (t.matches('select[data-b]')) {
        builder[t.dataset.b][+t.dataset.i] = t.value;
        rerender(container.querySelector('#builder'), builderHTML(), t);
      }
    });
    container.addEventListener('click', e => {
      const trait = e.target.closest('[data-trait]');
      if (trait) {
        container.querySelectorAll('[data-trait]').forEach(x => x.setAttribute('aria-pressed', String(x === trait)));
        chartTrait = trait.dataset.trait;
        drawChart(container, chartTrait);
        return;
      }
      const pt = e.target.closest('[data-ptable]');
      if (pt) {
        ptMoorit = pt.dataset.ptable === 'moorit';
        container.querySelector('#ptable').innerHTML = ptableHTML();
      }
    });
  }

  window.SheepGuide = { render };
})();
