/* Sheep Genetics Sandbox: genetics engine.
 *
 * No DOM. Genotypes and hidden breeding values live only inside a flock's
 * private store. Everything a flock hands out is phenotype, pedigree, or
 * derived from the player's own guesses.
 *
 * Works as a classic <script> (window.SheepEngine) and as a Node module.
 */
(function (root) {
  'use strict';

  const UNKNOWN = '?';

  // ---------------------------------------------------------------- genes
  //
  // Flags the generic code reads:
  //   fantasy        made up; only in flocks created with { fantasy: true }
  //   dev            unfinished; only in fantasy flocks that list it in devGenes
  //   wild           the normal allele, assumed when a genotype lacks the gene
  //   hiddenByWhite  doesn't show on a white sheep
  //   xLinked        on the X chromosome. A ram stores [null, x]: his sire gave a Y.
  //   lethal         allele that a lamb can't survive two copies of
  //   mutatesTo      allele that other alleles of the gene mutate into, at mutationRate

  // Chance that a passed-on normal speckle allele turns into speckled.
  const SPECKLE_MUTATION_RATE = 0.005;

  const BASE_GENES = [
    {
      key: 'agouti', name: 'Agouti',
      alleles: [
        { id: 'white', name: 'white', sym: 'A<sup>w</sup>', plain: 'Aw' },
        { id: 'badgerface', name: 'badgerface', sym: 'A<sup>bf</sup>', plain: 'Abf' },
        { id: 'mouflon', name: 'mouflon', sym: 'A<sup>mf</sup>', plain: 'Amf' },
        { id: 'solid', name: 'solid', sym: 'A<sup>a</sup>', plain: 'Aa' },
      ],
      freq: { white: 0.4, badgerface: 0.15, mouflon: 0.15, solid: 0.3 },
    },
    {
      key: 'extension', name: 'Extension',
      alleles: [
        { id: 'black', name: 'dominant black', sym: 'E<sup>D</sup>', plain: 'ED' },
        { id: 'normal', name: 'normal', sym: 'E<sup>+</sup>', plain: 'E+' },
      ],
      freq: { black: 0.12, normal: 0.88 },
    },
    {
      key: 'brown', name: 'Brown',
      alleles: [
        { id: 'normal', name: 'normal', sym: 'B', plain: 'B' },
        { id: 'brown', name: 'brown', sym: 'b', plain: 'b' },
      ],
      freq: { normal: 0.68, brown: 0.32 },
    },
    {
      key: 'spotting', name: 'Spotting',
      alleles: [
        { id: 'normal', name: 'normal', sym: 'S', plain: 'S' },
        { id: 'spotted', name: 'spotted', sym: 's', plain: 's' },
      ],
      freq: { normal: 0.7, spotted: 0.3 },
    },
    {
      key: 'horns', name: 'Horns',
      alleles: [
        { id: 'horned', name: 'horned', sym: 'H', plain: 'H' },
        { id: 'polled', name: 'polled', sym: 'P', plain: 'P' },
      ],
      freq: { horned: 0.45, polled: 0.55 },
    },
    {
      key: 'booroola', name: 'Booroola',
      alleles: [
        { id: 'carrier', name: 'Booroola', sym: 'F<sup>B</sup>', plain: 'FB' },
        { id: 'plus', name: 'non-carrier', sym: 'F<sup>+</sup>', plain: 'F+' },
      ],
      freq: { carrier: 0.15, plus: 0.85 },
    },
  ];

  const FANTASY_GENES = [
    {
      key: 'dilution', name: 'Dilution', fantasy: true, hiddenByWhite: true, wild: 'full',
      alleles: [
        { id: 'full', name: 'full', sym: 'D', plain: 'D' },
        { id: 'dilute', name: 'dilute', sym: 'd', plain: 'd' },
      ],
      freq: { full: 0.7, dilute: 0.3 },
    },
    {
      key: 'hue', name: 'Hue', fantasy: true, hiddenByWhite: true, wild: 'normal',
      alleles: [
        { id: 'normal', name: 'normal', sym: 'Hu<sup>+</sup>', plain: 'Hu+' },
        { id: 'rose', name: 'rose', sym: 'Hu<sup>r</sup>', plain: 'Hur' },
        { id: 'blue', name: 'blue', sym: 'Hu<sup>b</sup>', plain: 'Hub' },
      ],
      freq: { normal: 0.6, rose: 0.2, blue: 0.2 },
    },
    {
      key: 'opal', name: 'Opal', fantasy: true, dev: true, xLinked: true, wild: 'plain',
      alleles: [
        { id: 'opal', name: 'opal', sym: 'X<sup>O</sup>', plain: 'XO' },
        { id: 'plain', name: 'plain', sym: 'X<sup>+</sup>', plain: 'X+' },
      ],
      freq: { opal: 0.2, plain: 0.8 },
    },
    {
      key: 'speckle', name: 'Speckle', fantasy: true, wild: 'normal',
      mutatesTo: 'speckled', mutationRate: SPECKLE_MUTATION_RATE,
      alleles: [
        { id: 'normal', name: 'normal', sym: 'St', plain: 'St' },
        { id: 'speckled', name: 'speckled', sym: 'st', plain: 'st' },
      ],
      freq: { normal: 0.75, speckled: 0.25 },
    },
    {
      key: 'lantern', name: 'Lantern', fantasy: true, lethal: 'glow', wild: 'plain',
      alleles: [
        { id: 'glow', name: 'glow', sym: 'L', plain: 'L' },
        { id: 'plain', name: 'plain', sym: '+', plain: '+' },
      ],
      freq: { glow: 0.15, plain: 0.85 },
    },
  ];

  const GENES = BASE_GENES.concat(FANTASY_GENES);
  const GENE = {};
  for (const g of GENES) GENE[g.key] = g;
  const COLOR_GENES = ['agouti', 'extension', 'brown', 'spotting', 'hue', 'dilution'];

  function alleleIds(geneKey) { return GENE[geneKey].alleles.map(a => a.id); }
  function allele(geneKey, id) { return GENE[geneKey].alleles.find(a => a.id === id) || null; }

  // ------------------------------------------------------- fleece traits

  // Population mean and phenotypic SD per trait. worseDir is the direction an
  // inbreeding penalty pushes the measured value.
  const TRAITS = [
    { key: 'diameter', name: 'Fiber diameter', unit: 'µm', mean: 28, sd: 4, h2: 0.6, min: 14, max: 42, worseDir: +1, hint: 'lower is finer' },
    { key: 'staple', name: 'Staple length', unit: 'cm', mean: 10, sd: 2.5, h2: 0.5, min: 3, max: 22, worseDir: -1 },
    { key: 'crimp', name: 'Crimp', unit: 'per inch', mean: 8, sd: 3, h2: 0.4, min: 0, max: 22, worseDir: -1 },
    { key: 'luster', name: 'Luster', unit: '/ 10', mean: 5, sd: 1.8, h2: 0.5, min: 0, max: 10, worseDir: -1 },
  ];
  const TRAIT = {};
  for (const t of TRAITS) TRAIT[t.key] = t;

  // Threshold traits (fantasy only): a hidden score on a standard-normal
  // scale, inherited like fleece. Only whether it passes the threshold shows,
  // as phenotype[field].
  const LIABILITIES = [
    { key: 'gild', field: 'gilded', name: 'Gilded', h2: 0.5, threshold: 1.0 },
  ];

  // Measured-value penalty, in phenotypic SDs per unit of inbreeding coefficient.
  const INBREEDING_FLEECE_PENALTY = 1.2;
  // Fraction of the chance of twins/triplets lost per unit of the ewe's inbreeding.
  const INBREEDING_LITTER_PENALTY = 1.2;

  // Most times a sheep can be bred: one litter per breeding.
  const BREEDING_LIMIT = { ram: 10, ewe: 5 };

  // Most sheep the game's flock holds. Only sheep that can still breed count:
  // retired ones don't. At the limit, breeding, "+ Random sheep" and returning
  // sheep to breeding stop until some retire. A litter born just under it can
  // take the flock up to 2 over.
  const MAX_FLOCK_SIZE = 60;

  // Chance of a litter of 1, 2 or 3 by the ewe's number of Booroola copies.
  const LITTER_TABLE = [
    [0.62, 0.33, 0.05],
    [0.28, 0.52, 0.20],
    [0.12, 0.43, 0.45],
  ];

  // ------------------------------------------------------------- random

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rng) {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  function pickWeighted(rng, weights) {
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round1 = v => Math.round(v * 10) / 10;
  const round2 = v => Math.round(v * 100) / 100;

  function normPdf(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }

  // Abramowitz & Stegun 7.1.26: error under 1.5e-7.
  function normCdf(x) {
    const z = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * z);
    const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
  }

  // ---------------------------------------------------------- phenotype
  //
  // Each function reads only the genes it needs, and treats a missing
  // fantasy gene as its wild allele, so base genotypes work unchanged.

  const pairOf = (g, key) => g[key] || [GENE[key].wild, GENE[key].wild];
  const copies = (pair, a) => (pair[0] === a) + (pair[1] === a);

  // 'white', or the pattern agouti and extension paint.
  function patternOf(g) {
    const ag = g.agouti;
    if (ag[0] === 'white' || ag[1] === 'white') return 'white';
    if (g.extension[0] === 'black' || g.extension[1] === 'black') return 'solid';
    const bf = ag.includes('badgerface');
    const mf = ag.includes('mouflon');
    return bf && mf ? 'mixed' : bf ? 'badgerface' : mf ? 'mouflon' : 'solid';
  }

  // Hue, if it shows, replaces the color Brown would give.
  function darkColorOf(g) {
    const hue = pairOf(g, 'hue');
    const rose = copies(hue, 'rose');
    const blue = copies(hue, 'blue');
    if (rose + blue === 2) return rose === 2 ? 'rose' : blue === 2 ? 'blue' : 'violet';
    return g.brown[0] === 'brown' && g.brown[1] === 'brown' ? 'brown' : 'black';
  }

  function shadeOf(g) { return ['full', 'dusk', 'frost'][copies(pairOf(g, 'dilution'), 'dilute')]; }
  function spottedOf(g) { return g.spotting[0] === 'spotted' && g.spotting[1] === 'spotted'; }

  // A ram shows his one X; a ewe with one opal X is patchy.
  function opalOf(g, sex) {
    const pair = pairOf(g, 'opal');
    if (sex === 'ram') return pair[1] === 'opal' ? 'full' : 'none';
    return ['none', 'patchy', 'full'][copies(pair, 'opal')];
  }

  function speckledOf(g) { return copies(pairOf(g, 'speckle'), 'speckled') === 2; }
  function glowOf(g) { return copies(pairOf(g, 'lantern'), 'glow') > 0; }

  // A lamb with two copies of a lethal allele doesn't develop.
  function lostOf(g) {
    return GENES.some(gene => gene.lethal && g[gene.key] && copies(g[gene.key], gene.lethal) === 2);
  }

  function colorOf(g) {
    const pattern = patternOf(g);
    const look = pattern === 'white'
      ? { color: 'white', pattern: 'none', spotted: false }
      : { color: darkColorOf(g), pattern, spotted: spottedOf(g) };
    if (g.dilution) look.shade = pattern === 'white' ? 'full' : shadeOf(g);
    return look;
  }

  function hornedOf(pair, sex) {
    const n = (pair[0] === 'horned') + (pair[1] === 'horned');
    return n === 2 || (n === 1 && sex === 'ram');
  }

  function booroolaCopies(pair) {
    return (pair[0] === 'carrier') + (pair[1] === 'carrier');
  }

  /**
   * Visible look of any genotype. Used by flocks and by the guide's examples.
   * Fantasy fields appear only when the genotype has those genes. Gilded comes
   * from a hidden score, not a gene, so flocks add it themselves.
   */
  function phenotypeOf(genotype, sex) {
    const look = Object.assign({ sex }, colorOf(genotype), { horned: hornedOf(genotype.horns, sex) });
    if (genotype.opal) look.opal = opalOf(genotype, sex);
    if (genotype.speckle) look.speckled = speckledOf(genotype);
    if (genotype.lantern) look.glow = glowOf(genotype);
    return look;
  }

  function colorKey(look) {
    return look.color + '/' + look.pattern + '/' + (look.spotted ? 1 : 0) + '/' + (look.shade || 'full');
  }

  /** Everything visible about a look except fleece, as one string. */
  function lookKey(look) {
    return [colorKey(look), look.sex, look.horned ? 1 : 0, look.opal || 'none',
      look.speckled ? 1 : 0, look.glow ? 1 : 0, look.gilded ? 1 : 0].join('/');
  }

  // ------------------------------------------------------- inheritance

  function drawPair(rng, gene, freq, sex) {
    const ids = gene.alleles.map(a => a.id);
    const w = ids.map(id => freq[id] || 0);
    const pick = () => ids[pickWeighted(rng, w)];
    if (gene.xLinked && sex === 'ram') return [null, pick()];
    for (;;) {
      const pair = [pick(), pick()];
      // Founders are alive, so they never carry two lethal alleles.
      if (!gene.lethal || copies(pair, gene.lethal) < 2) return pair;
    }
  }

  /** opts.genes: which genes (default the base ones). opts.sex matters for X-linked genes. */
  function randomGenotype(rng, freqOverride, opts) {
    const o = opts || {};
    const g = {};
    for (const gene of o.genes || BASE_GENES) {
      const freq = Object.assign({}, gene.freq, freqOverride && freqOverride[gene.key]);
      g[gene.key] = drawPair(rng, gene, freq, o.sex || 'ewe');
    }
    return g;
  }

  /** A lamb's genotype. Genes missing from either parent are left out. */
  function inheritGenotype(rng, sireG, damG, sex) {
    const g = {};
    for (const gene of GENES) {
      const s = sireG[gene.key];
      const d = damG[gene.key];
      if (!s || !d) continue;
      let pair = gene.xLinked
        ? [sex === 'ram' ? null : s[1], d[rng() < 0.5 ? 0 : 1]]
        : [s[rng() < 0.5 ? 0 : 1], d[rng() < 0.5 ? 0 : 1]];
      if (gene.mutatesTo) {
        pair = pair.map(a => (a !== null && a !== gene.mutatesTo && rng() < gene.mutationRate ? gene.mutatesTo : a));
      }
      g[gene.key] = pair;
    }
    return g;
  }

  function litterProbabilities(copies, inbreeding) {
    const base = LITTER_TABLE[copies];
    const keep = clamp(1 - INBREEDING_LITTER_PENALTY * (inbreeding || 0), 0, 1);
    const p2 = base[1] * keep;
    const p3 = base[2] * keep;
    return [1 - p2 - p3, p2, p3];
  }

  function founderBreedingValues(rng, liabilities) {
    const gv = {};
    for (const t of TRAITS) gv[t.key] = t.mean + gaussian(rng) * t.sd * Math.sqrt(t.h2);
    for (const l of liabilities || []) gv[l.key] = gaussian(rng) * Math.sqrt(l.h2);
    return gv;
  }

  function lambBreedingValues(rng, sireGv, damGv, sireF, damF, liabilities) {
    const gv = {};
    // Mendelian sampling variance shrinks as the parents get more inbred.
    const keep = 1 - ((sireF || 0) + (damF || 0)) / 2;
    for (const t of TRAITS) {
      gv[t.key] = (sireGv[t.key] + damGv[t.key]) / 2 + gaussian(rng) * t.sd * Math.sqrt((t.h2 / 2) * keep);
    }
    for (const l of liabilities || []) {
      gv[l.key] = ((sireGv[l.key] || 0) + (damGv[l.key] || 0)) / 2 + gaussian(rng) * Math.sqrt((l.h2 / 2) * keep);
    }
    return gv;
  }

  function inbreedingShift(trait, F) {
    return trait.worseDir * INBREEDING_FLEECE_PENALTY * trait.sd * (F || 0);
  }

  function measureFleece(rng, gv, F) {
    const m = {};
    for (const t of TRAITS) {
      const v = gv[t.key] + gaussian(rng) * t.sd * Math.sqrt(1 - t.h2) + inbreedingShift(t, F);
      m[t.key] = round1(clamp(v, t.min, t.max));
    }
    return m;
  }

  // The visible side of each threshold trait: only whether the score passed.
  function thresholdLooks(rng, gv, liabilities) {
    const out = {};
    for (const l of liabilities) out[l.field] = (gv[l.key] || 0) + gaussian(rng) * Math.sqrt(1 - l.h2) > l.threshold;
    return out;
  }

  // ---------------------------------------- predictions from guesses
  //
  // A guess is { gene: [allele | '?', allele | '?'] }, plus an optional
  // ruledOut: { gene: [allele, ...] } of alleles the player says it doesn't
  // have. A '?' then stands for any allele that isn't ruled out. A ram's guess
  // for an X-linked gene is [null, allele | '?']. Predictions never look at
  // real genotypes: only at what the player wrote. The genes in a pair of
  // guesses are the genes predicted.

  function blankGuess(genes) {
    const g = {};
    for (const gene of genes || BASE_GENES) g[gene.key || gene] = [UNKNOWN, UNKNOWN];
    return g;
  }

  function activeKeys(...guesses) {
    return new Set(GENES.filter(g => guesses.every(x => x && x[g.key])).map(g => g.key));
  }

  // Alleles a '?' slot can stand for under this guess.
  function allowedAlleles(guess, geneKey) {
    const ids = alleleIds(geneKey);
    const out = guess && guess.ruledOut && guess.ruledOut[geneKey];
    if (!out || !out.length) return ids;
    const left = ids.filter(a => !out.includes(a));
    return left.length ? left : ids;
  }

  // A living sheep can't have two lethal alleles, so a '?' next to one isn't lethal.
  function alive(guess) {
    let out = guess;
    for (const gene of GENES) {
      const slots = guess[gene.key];
      if (!gene.lethal || !slots || !slots.includes(gene.lethal) || !slots.includes(UNKNOWN)) continue;
      if (out === guess) out = Object.assign({}, guess, { ruledOut: Object.assign({}, guess.ruledOut) });
      out.ruledOut[gene.key] = [...new Set((out.ruledOut[gene.key] || []).concat(gene.lethal))];
    }
    return out;
  }

  function addPair(map, pair, p) {
    const key = pair.join('|');
    const cur = map.get(key);
    if (cur) cur.p += p;
    else map.set(key, { pair, p });
  }

  // Lamb allele pairs for one gene, as [fromSire, fromDam] with probabilities.
  // A '?' at index 0 is the sire's unknown allele, at index 1 the dam's.
  function lambPairs(sireSlots, damSlots) {
    const map = new Map();
    for (const a of sireSlots) for (const b of damSlots) addPair(map, [a, b], 0.25);
    return [...map.values()];
  }

  // X-linked: a ram lamb gets his sire's Y and one of his dam's X's; a ewe
  // lamb gets her sire's only X and one of her dam's.
  function xLambPairs(sireSlots, damSlots, sex) {
    const map = new Map();
    for (const b of damSlots) addPair(map, [sex === 'ram' ? null : sireSlots[1], b], 0.5);
    return [...map.values()];
  }

  // Fill in every '?' in a lamb combo every possible way. optsFor(gene, idx)
  // gives the alleles the '?' from the sire (idx 0) or dam (idx 1) can be.
  // Returns each distinct outcome and which unknown slots can change it.
  function resolveUnknowns(combo, genes, evaluate, optsFor) {
    const slots = [];
    for (const g of genes) {
      combo[g].forEach((a, i) => { if (a === UNKNOWN) slots.push({ gene: g, idx: i, opts: optsFor(g, i) }); });
    }
    if (!slots.length) {
      const r = evaluate(combo);
      return { outcomes: new Map([[r.key, r]]), influencers: [] };
    }
    const work = {};
    for (const g of genes) work[g] = combo[g].slice();
    const radix = slots.map(s => s.opts.length);
    const total = radix.reduce((a, b) => a * b, 1);
    const keys = new Array(total);
    const outcomes = new Map();
    for (let n = 0; n < total; n++) {
      let r = n;
      for (let k = 0; k < slots.length; k++) {
        work[slots[k].gene][slots[k].idx] = slots[k].opts[r % radix[k]];
        r = Math.floor(r / radix[k]);
      }
      const res = evaluate(work);
      keys[n] = res.key;
      if (!outcomes.has(res.key)) outcomes.set(res.key, res);
    }
    const influencers = [];
    if (outcomes.size > 1) {
      let stride = 1;
      slots.forEach((s, k) => {
        let matters = false;
        for (let n = 0; n < total && !matters; n++) {
          if (Math.floor(n / stride) % radix[k] !== 0) continue;
          for (let d = 1; d < radix[k]; d++) {
            if (keys[n + d * stride] !== keys[n]) { matters = true; break; }
          }
        }
        if (matters) influencers.push({ gene: s.gene, parent: s.idx === 0 ? 'sire' : 'dam' });
        stride *= radix[k];
      });
    }
    return { outcomes, influencers };
  }

  function addDepends(list, more) {
    for (const inf of more) {
      if (!list.some(d => d.gene === inf.gene && d.parent === inf.parent)) list.push(inf);
    }
  }

  const round4 = v => Math.round(v * 1e4) / 1e4;
  const byChance = (a, b) => b.max - a.max || b.min - a.min;

  /**
   * Offspring outcome probabilities for some genes, tried all at once. Each
   * outcome gets a range [min, max]: min is certain under the guesses, max
   * adds lambs whose look hinges on a '?'. evaluate(genotype) -> { key, value }.
   * opts.sex: the lamb's sex, needed for X-linked genes. opts.raw: don't round.
   */
  function predictOutcomes(sireGuess, damGuess, genes, evaluate, opts) {
    const o = opts || {};
    const perGene = genes.map(g => (GENE[g].xLinked
      ? xLambPairs(sireGuess[g], damGuess[g], o.sex)
      : lambPairs(sireGuess[g], damGuess[g])));
    const optsFor = (g, idx) => allowedAlleles(idx === 0 ? sireGuess : damGuess, g);
    const results = new Map();
    const combo = {};
    function add(res, p, certain, influencers) {
      let out = results.get(res.key);
      if (!out) { out = { key: res.key, value: res.value, min: 0, max: 0, depends: [] }; results.set(res.key, out); }
      out.max += p;
      if (certain) out.min += p;
      addDepends(out.depends, influencers);
    }
    (function walk(i, p) {
      if (i === genes.length) {
        const { outcomes, influencers } = resolveUnknowns(combo, genes, evaluate, optsFor);
        const certain = outcomes.size === 1;
        for (const res of outcomes.values()) add(res, p, certain, influencers);
        return;
      }
      for (const { pair, p: q } of perGene[i]) {
        combo[genes[i]] = pair;
        walk(i + 1, p * q);
      }
    })(0, 1);
    const list = [...results.values()];
    if (!o.raw) for (const x of list) { x.min = round4(x.min); x.max = round4(x.max); }
    return list.sort(byChance);
  }

  // Given that a lamb isn't white, its color splits into independent parts.
  // Predicting each part on its own and multiplying gives the same answer as
  // trying every '?' across all color genes at once, at a fraction of the work.
  const COLOR_FACTORS = [
    { key: 'pattern', genes: ['agouti', 'extension'], of: patternOf, fixed: 'solid' },
    { key: 'dark', genes: ['brown', 'hue'], of: darkColorOf, fixed: 'black' },
    { key: 'shade', genes: ['dilution'], of: shadeOf, fixed: 'full' },
    { key: 'spots', genes: ['spotting'], of: spottedOf, fixed: false },
  ];

  function predictColors(sireGuess, damGuess, active) {
    const parts = {};
    for (const f of COLOR_FACTORS) {
      const genes = f.genes.filter(g => active.has(g));
      parts[f.key] = genes.length
        ? predictOutcomes(sireGuess, damGuess, genes, g => { const v = f.of(g); return { key: String(v), value: v }; }, { raw: true })
        : null;
    }
    const pick = k => parts[k] || [{ value: COLOR_FACTORS.find(f => f.key === k).fixed, min: 1, max: 1, depends: [] }];
    const looks = [];
    for (const pat of parts.pattern) {
      if (pat.value === 'white') {
        const value = { color: 'white', pattern: 'none', spotted: false };
        if (parts.shade) value.shade = 'full';
        looks.push({ value, min: pat.min, max: pat.max, depends: pat.depends.slice() });
        continue;
      }
      for (const dk of pick('dark')) {
        for (const sh of pick('shade')) {
          for (const sp of pick('spots')) {
            const value = { color: dk.value, pattern: pat.value, spotted: sp.value };
            if (parts.shade) value.shade = sh.value;
            const depends = [];
            for (const x of [pat, dk, sh, sp]) addDepends(depends, x.depends);
            looks.push({ value, min: pat.min * dk.min * sh.min * sp.min, max: pat.max * dk.max * sh.max * sp.max, depends });
          }
        }
      }
    }
    for (const l of looks) { l.key = colorKey(l.value); l.min = round4(l.min); l.max = round4(l.max); }
    for (const k of Object.keys(parts)) {
      if (parts[k]) for (const x of parts[k]) { x.min = round4(x.min); x.max = round4(x.max); }
    }
    return { colors: looks.sort(byChance), parts };
  }

  const ORDER = {
    opal: ['full', 'patchy', 'none'],
    glow: ['glow', 'plain', 'lost'],
  };
  const inOrder = list => (a, b) => list.indexOf(a.key) - list.indexOf(b.key);

  // The chance of one yes/no outcome, as { min, max, depends }.
  function chanceOf(outcomes, key) {
    const o = outcomes.find(x => x.key === key);
    return o ? { min: o.min, max: o.max, depends: o.depends } : { min: 0, max: 0, depends: [] };
  }

  function predictOffspring(sire, dam) {
    const sireGuess = alive(sire);
    const damGuess = alive(dam);
    const active = activeKeys(sireGuess, damGuess);
    const { colors, parts } = predictColors(sireGuess, damGuess, active);
    const horns = {};
    for (const sex of ['ram', 'ewe']) {
      horns[sex] = chanceOf(predictOutcomes(sireGuess, damGuess, ['horns'], g => {
        const h = hornedOf(g.horns, sex);
        return { key: h ? 'horned' : 'polled', value: h };
      }), 'horned');
    }
    const booroola = predictOutcomes(sireGuess, damGuess, ['booroola'], g => {
      const n = booroolaCopies(g.booroola);
      return { key: String(n), value: n };
    }).sort((a, b) => a.value - b.value);
    const out = { colors, colorParts: parts, horns, booroola };
    if (active.has('opal')) {
      out.opal = {};
      for (const sex of ['ram', 'ewe']) {
        out.opal[sex] = predictOutcomes(sireGuess, damGuess, ['opal'], g => {
          const v = opalOf(g, sex);
          return { key: v, value: v };
        }, { sex }).sort(inOrder(ORDER.opal));
      }
    }
    if (active.has('speckle')) {
      // Ignores new mutations, which are too rare to show as a percentage.
      out.speckle = chanceOf(predictOutcomes(sireGuess, damGuess, ['speckle'], g => {
        const v = speckledOf(g);
        return { key: v ? 'speckled' : 'plain', value: v };
      }), 'speckled');
    }
    if (active.has('lantern')) {
      // "Not born" is its own outcome, so the other ranges need no renormalizing.
      out.glow = predictOutcomes(sireGuess, damGuess, ['lantern'], g => {
        const v = lostOf(g) ? 'lost' : glowOf(g) ? 'glow' : 'plain';
        return { key: v, value: v };
      }).sort(inOrder(ORDER.glow));
    }
    return out;
  }

  // ---------------------------------------- consistency ("surprise") checks

  function expandSlot(geneKey, a, allowed) { return a === UNKNOWN ? allowed || alleleIds(geneKey) : [a]; }
  function uniq(arr) { return [...new Set(arr)]; }
  function cross(xs, ys) {
    const out = [];
    for (const x of xs) for (const y of ys) out.push([x, y]);
    return out;
  }

  // Every allele pair a lamb could carry, given its parents' guesses.
  // mutate: 'sire' or 'dam' lets that parent pass on a new mutation too.
  function pairsFromParents(geneKey, sireSlots, damSlots, sireAllowed, damAllowed, sex, mutate) {
    const gene = GENE[geneKey];
    const passes = (slots, allowed, who) => {
      const out = uniq(slots.filter(a => a !== null).flatMap(a => expandSlot(geneKey, a, allowed)));
      if (mutate === who && gene.mutatesTo && !out.includes(gene.mutatesTo)) out.push(gene.mutatesTo);
      return out;
    };
    const d = passes(damSlots, damAllowed, 'dam');
    if (gene.xLinked) {
      return sex === 'ram' ? d.map(b => [null, b]) : cross(passes([sireSlots[1]], sireAllowed, 'sire'), d);
    }
    return cross(passes(sireSlots, sireAllowed, 'sire'), d);
  }

  // Every allele pair a sheep could carry, given its own guess.
  function pairsFromOwn(geneKey, slots, allowed, sex) {
    if (GENE[geneKey].xLinked && sex === 'ram') return expandSlot(geneKey, slots[1], allowed).map(x => [null, x]);
    return cross(expandSlot(geneKey, slots[0], allowed), expandSlot(geneKey, slots[1], allowed));
  }

  function allPairs(geneKey, sex) { return pairsFromOwn(geneKey, [UNKNOWN, UNKNOWN], null, sex); }

  // Does any combination of these pairs give the look?
  function anyCombo(pairs, genes, test) {
    const g = {};
    return (function rec(i) {
      if (i === genes.length) return test(g);
      for (const p of pairs[genes[i]]) {
        g[genes[i]] = p;
        if (rec(i + 1)) return true;
      }
      return false;
    })(0);
  }

  // One group per visible part of a sheep. Parts marked colored don't show on
  // a white sheep, so a white lamb only has its pattern checked.
  const CHECK_GROUPS = [
    { trait: 'pattern', genes: ['agouti', 'extension'], of: patternOf, want: l => (l.color === 'white' ? 'white' : l.pattern) },
    { trait: 'dark color', genes: ['brown', 'hue'], colored: true, of: darkColorOf, want: l => l.color },
    { trait: 'shade', genes: ['dilution'], colored: true, of: shadeOf, want: l => l.shade || 'full' },
    { trait: 'spots', genes: ['spotting'], colored: true, of: spottedOf, want: l => !!l.spotted },
    { trait: 'horns', genes: ['horns'], of: (g, sex) => hornedOf(g.horns, sex), want: l => l.horned },
    { trait: 'opal', genes: ['opal'], of: opalOf, want: l => l.opal || 'none' },
    { trait: 'speckle', genes: ['speckle'], of: speckledOf, want: l => !!l.speckled, mutation: true },
    { trait: 'glow', genes: ['lantern'], of: g => (lostOf(g) ? 'lost' : glowOf(g)), want: l => !!l.glow },
  ];

  function subsetsBySize(items) {
    const out = [];
    for (let mask = 1; mask < (1 << items.length); mask++) {
      out.push(items.filter((_, i) => mask & (1 << i)));
    }
    return out.sort((a, b) => a.length - b.length);
  }

  function groupsFor(look, active) {
    const out = [];
    for (const grp of CHECK_GROUPS) {
      if (grp.colored && look.color === 'white') continue;
      const genes = grp.genes.filter(g => active.has(g));
      if (!genes.length) continue;
      const want = grp.want(look);
      out.push({ grp, genes, test: g => grp.of(g, look.sex) === want });
    }
    return out;
  }

  /**
   * Does a lamb's look fit its parents' guesses? Returns a list of issues, one
   * per impossible part of its look ('pattern', 'dark color', 'shade', 'spots',
   * 'horns', 'opal', 'speckle', 'glow'), each naming the gene guesses that
   * would have to give. culprit is 'sire' or 'dam' (that parent's guess
   * alone), 'either' (one of the two), or 'both' (both parents' guesses).
   * An issue with rare: true could instead be a new mutation.
   */
  function checkLamb(look, sire, dam) {
    const sireGuess = alive(sire);
    const damGuess = alive(dam);
    const issues = [];
    for (const { grp, genes, test } of groupsFor(look, activeKeys(sireGuess, damGuess))) {
      const build = (relax, mutate) => {
        const pairs = {};
        for (const g of genes) {
          // A relaxed guess drops both its slots and its ruled-out alleles.
          const relaxS = relax[g] === 'sire' || relax[g] === 'both';
          const relaxD = relax[g] === 'dam' || relax[g] === 'both';
          pairs[g] = pairsFromParents(g,
            relaxS ? [UNKNOWN, UNKNOWN] : sireGuess[g], relaxD ? [UNKNOWN, UNKNOWN] : damGuess[g],
            relaxS ? null : allowedAlleles(sireGuess, g), relaxD ? null : allowedAlleles(damGuess, g),
            look.sex, mutate);
        }
        return pairs;
      };
      const possible = pairs => anyCombo(pairs, genes, test);
      if (possible(build({}))) continue;
      if (grp.mutation) {
        const sire = possible(build({}, 'sire'));
        const dam = possible(build({}, 'dam'));
        if (sire || dam) {
          issues.push({ trait: grp.trait, rare: true, genes: [{ gene: genes[0], culprit: sire && dam ? 'either' : sire ? 'sire' : 'dam' }] });
          continue;
        }
      }
      let found = null;
      for (const subset of subsetsBySize(genes)) {
        const relax = {};
        for (const g of subset) relax[g] = 'both';
        if (possible(build(relax))) { found = subset; break; }
      }
      if (!found) continue; // cannot happen: fully relaxed guesses allow any living look
      const named = found.map(g => {
        const relax = {};
        for (const o of found) relax[o] = 'both';
        relax[g] = 'sire';
        const sireAlone = possible(build(relax));
        relax[g] = 'dam';
        const damAlone = possible(build(relax));
        const culprit = sireAlone && damAlone ? 'either' : sireAlone ? 'sire' : damAlone ? 'dam' : 'both';
        return { gene: g, culprit };
      });
      issues.push({ trait: grp.trait, genes: named });
    }
    return issues;
  }

  /**
   * Does a sheep's own guess fit how it looks? Returns the genes that clash,
   * per part of its look. A living sheep can't have two lethal alleles.
   */
  function checkSelf(look, guess) {
    const issues = [];
    for (const { grp, genes, test } of groupsFor(look, activeKeys(guess))) {
      const build = relaxed => {
        const pairs = {};
        for (const g of genes) {
          pairs[g] = relaxed.includes(g) ? allPairs(g, look.sex) : pairsFromOwn(g, guess[g], allowedAlleles(guess, g), look.sex);
        }
        return pairs;
      };
      if (anyCombo(build([]), genes, test)) continue;
      for (const subset of subsetsBySize(genes)) {
        if (anyCombo(build(subset), genes, test)) { issues.push({ trait: grp.trait, genes: subset }); break; }
      }
    }
    return issues;
  }

  // --------------------------------------------------- breeding goals
  //
  // A goal is { gene: [allele | null, allele | null] }: the alleles the
  // player is breeding towards, with null for "any". A pair meets it if it
  // carries every allele named, as many times as named. Like predictions, goal
  // checks use only looks and the player's notes, never real genotypes.

  function goalGenes(goal) {
    return Object.keys(goal || {}).filter(k => GENE[k] && Array.isArray(goal[k]) && goal[k].some(a => a));
  }

  function meetsGoal(pair, want) {
    const have = pair.filter(a => a !== null);
    for (const a of want) {
      if (!a) continue;
      const i = have.indexOf(a);
      if (i < 0) return false;
      have.splice(i, 1);
    }
    return true;
  }

  // Call fn with every combination of these pairs that passes test.
  function eachCombo(pairs, genes, test, fn) {
    const g = {};
    (function rec(i) {
      if (i === genes.length) { if (test(g)) fn(g); return; }
      for (const p of pairs[genes[i]]) { g[genes[i]] = p; rec(i + 1); }
    })(0);
  }

  const verdict = (pairs, want) => (!pairs.length ? 'no' : pairs.every(p => meetsGoal(p, want)) ? 'yes'
    : pairs.some(p => meetsGoal(p, want)) ? 'maybe' : 'no');

  /**
   * How a sheep stands against a goal, from its look and the player's notes.
   * Returns { status, genes: { gene: status }, together } where each status is
   * 'yes' (certain), 'maybe' or 'no'. together is false when each gene could
   * fit on its own but not all at once with how the sheep looks. Null if the
   * goal names no alleles.
   */
  function goalStatus(look, guess, goal) {
    const active = activeKeys(guess);
    const want = goalGenes(goal).filter(g => active.has(g));
    if (!want.length) return null;
    const own = g => pairsFromOwn(g, guess[g], allowedAlleles(guess, g), look.sex)
      .filter(p => !(GENE[g].lethal && copies(p, GENE[g].lethal) === 2));
    const genes = {};
    let together = true;
    const seen = new Set();
    for (const { genes: gs, test } of groupsFor(look, active)) {
      let pairs = {};
      for (const g of gs) pairs[g] = own(g);
      // Notes that clash with the look are flagged elsewhere; judge by the look alone.
      if (!anyCombo(pairs, gs, test)) {
        pairs = {};
        for (const g of gs) pairs[g] = allPairs(g, look.sex).filter(p => !(GENE[g].lethal && copies(p, GENE[g].lethal) === 2));
      }
      // Pairs of each gene that fit the look in at least one combination.
      const fits = {};
      for (const g of gs) fits[g] = new Map();
      eachCombo(pairs, gs, test, combo => { for (const g of gs) fits[g].set(combo[g].join('|'), combo[g]); });
      const onGoal = {};
      for (const g of gs) onGoal[g] = want.includes(g) ? pairs[g].filter(p => meetsGoal(p, goal[g])) : pairs[g];
      if (!anyCombo(onGoal, gs, test)) together = false;
      for (const g of gs) {
        seen.add(g);
        if (want.includes(g)) genes[g] = verdict([...fits[g].values()], goal[g]);
      }
    }
    // Genes the look says nothing about, like Booroola or color genes on a white sheep.
    for (const g of want) if (!seen.has(g)) genes[g] = verdict(own(g), goal[g]);
    const all = want.map(g => genes[g]);
    const status = !together || all.includes('no') ? 'no' : all.every(v => v === 'yes') ? 'yes' : 'maybe';
    return { status, genes, together };
  }

  /**
   * Chance a lamb meets the goal, from the parents' guesses, per lamb sex:
   * { ram: { min, max, depends }, ewe: {...} }. Genes are independent, so each
   * is predicted on its own and the chances multiplied.
   */
  function predictGoal(sire, dam, goal) {
    const sireGuess = alive(sire);
    const damGuess = alive(dam);
    const active = activeKeys(sireGuess, damGuess);
    const want = goalGenes(goal).filter(g => active.has(g));
    if (!want.length) return null;
    const out = {};
    for (const sex of ['ram', 'ewe']) {
      let min = 1;
      let max = 1;
      const depends = [];
      for (const k of want) {
        const o = chanceOf(predictOutcomes(sireGuess, damGuess, [k], g => {
          const v = !lostOf(g) && meetsGoal(g[k], goal[k]) ? 'yes' : 'no';
          return { key: v, value: v };
        }, { sex, raw: true }), 'yes');
        min *= o.min;
        max *= o.max;
        addDepends(depends, o.depends);
      }
      out[sex] = { min: round4(min), max: round4(max), depends };
    }
    return out;
  }

  // --------------------------------------------------- secret encoding

  const KEY = 'baa-baa-black-sheep-have-you-any-wool';

  function xorString(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) out += String.fromCharCode(s.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
    return out;
  }

  // JSON of genotypes and numbers is plain ASCII, so XOR stays in byte range.
  function encodeSecret(obj) { return btoa(xorString(JSON.stringify(obj))); }
  function decodeSecret(str) { return JSON.parse(xorString(atob(str))); }

  // --------------------------------------------------------------- flock

  function devKeys(list) {
    return Array.isArray(list) ? GENES.filter(g => g.dev && list.includes(g.key)).map(g => g.key) : [];
  }

  /**
   * A flock: public sheep records plus a private store of genotypes.
   *
   * options.rng        random function (defaults to Math.random)
   * options.nameFor    function(sex) -> name for new sheep
   * options.fantasy    include the made-up fantasy genes
   * options.devGenes   keys of dev-only fantasy genes to include too
   * options.maxSize    most sheep before breeding stops (default: no limit)
   * options.debug      expose peekGenotype() for the test page
   */
  function createFlock(options) {
    const opts = options || {};
    const rng = opts.rng || Math.random;
    const nameFor = opts.nameFor || (() => 'Sheep ' + nextId);
    let fantasy = !!opts.fantasy;
    let devGenes = devKeys(opts.devGenes);
    const maxSize = opts.maxSize > 0 ? opts.maxSize : Infinity;

    let sheep = new Map();    // id -> public record
    let secret = new Map();   // id -> { genotype, gv }
    let history = [];         // breeding events, newest last
    let nextId = 1;
    let serial = 0;
    let nextEvent = 1;
    let kinMemo = new Map();
    const HISTORY_LIMIT = 50;

    const genesOn = () => (fantasy ? GENES.filter(g => !g.dev || devGenes.includes(g.key)) : BASE_GENES);
    const liabilitiesOn = () => (fantasy ? LIABILITIES : []);

    function rec(id) { return sheep.get(id) || null; }

    // A sheep retires when it reaches its breeding limit, or early when the
    // player retires it. Retired sheep stay in the records but take no space.
    const takesSpace = r => !r.retired && r.litters.length < BREEDING_LIMIT[r.sex];

    // How many more sheep fit before the flock is full.
    function room() {
      let n = 0;
      for (const r of sheep.values()) if (takesSpace(r)) n++;
      return maxSize - n;
    }

    function breedingsLeft(id) {
      const r = rec(id);
      return r && !r.retired ? Math.max(0, BREEDING_LIMIT[r.sex] - r.litters.length) : 0;
    }

    // A sheep retired early can breed again, if a full flock has room for it.
    function unretire(id) {
      const r = rec(id);
      if (!r || !r.retired) return;
      if (takesSpace(Object.assign({}, r, { retired: false })) && room() <= 0) throw new Error('Flock is full');
      delete r.retired;
    }

    function kinship(a, b) {
      if (!a || !b) return 0;
      const ra = sheep.get(a);
      const rb = sheep.get(b);
      if (!ra || !rb) return 0;
      if (a === b) return (1 + (ra.inbreeding || 0)) / 2;
      const key = a < b ? a + '|' + b : b + '|' + a;
      const hit = kinMemo.get(key);
      if (hit !== undefined) return hit;
      // Expand the younger animal: it cannot be an ancestor of the older one.
      const [young, old] = ra.born > rb.born ? [ra, b] : [rb, a];
      const v = (kinship(young.sire, old) + kinship(young.dam, old)) / 2;
      kinMemo.set(key, v);
      return v;
    }

    // Coefficient of relationship: the share of genes two sheep have in common
    // by descent, from the pedigree. Full siblings 0.5, half siblings 0.25.
    function relatedness(a, b) {
      const ra = rec(a);
      const rb = rec(b);
      if (!ra || !rb) return 0;
      return 2 * kinship(a, b) / Math.sqrt((1 + (ra.inbreeding || 0)) * (1 + (rb.inbreeding || 0)));
    }

    // The breeding flock: sheep that will pass on more genes. Retired sheep
    // and those with no breedings left don't count.
    const breeders = () => [...sheep.values()].filter(takesSpace);

    // How related a sheep is to the breeding flock: its average relatedness to
    // every breeding sheep but itself. Low means its genes are rare there.
    // Null when there's no other breeding sheep.
    function relatednessToFlock(id) {
      if (!rec(id)) return null;
      const others = breeders().filter(r => r.id !== id);
      if (!others.length) return null;
      return others.reduce((sum, r) => sum + relatedness(id, r.id), 0) / others.length;
    }

    // Diversity of the breeding flock, from the pedigree: 1 minus the average
    // kinship of every pair of breeding sheep, that is, minus how inbred a
    // lamb of two of them picked at random would be. It's 1 when no two share
    // an ancestor and falls as more of the flock descends from the same few.
    // Null with fewer than two breeding sheep.
    function diversity() {
      const pool = breeders();
      if (pool.length < 2) return null;
      let sum = 0;
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) sum += kinship(pool[i].id, pool[j].id);
      }
      return 1 - sum / (pool.length * (pool.length - 1) / 2);
    }

    function makeRecord(fields, genotype, gv) {
      const id = 's' + nextId++;
      const r = {
        id,
        name: fields.name || nameFor(fields.sex),
        sex: fields.sex,
        gen: fields.gen || 0,
        born: ++serial,
        sire: fields.sire || null,
        dam: fields.dam || null,
        inbreeding: fields.inbreeding || 0,
        phenotype: Object.assign(phenotypeOf(genotype, fields.sex), thresholdLooks(rng, gv, liabilitiesOn()), {
          fleece: measureFleece(rng, gv, fields.inbreeding || 0),
        }),
        litters: [],
      };
      sheep.set(id, r);
      secret.set(id, { genotype, gv });
      return r;
    }

    // A given genotype keeps only this flock's genes; missing ones are wild.
    function fitGenotype(g, sex) {
      const out = {};
      for (const gene of genesOn()) {
        const pair = g[gene.key] ? g[gene.key].slice() : [gene.wild, gene.wild];
        out[gene.key] = gene.xLinked && sex === 'ram' ? [null, pair[1]] : pair;
      }
      return out;
    }

    function addSheep(fields) {
      const f = fields || {};
      const sex = f.sex || (rng() < 0.5 ? 'ram' : 'ewe');
      const genotype = f.genotype ? fitGenotype(f.genotype, sex) : randomGenotype(rng, f.freq, { genes: genesOn(), sex });
      const gv = f.gv ? Object.assign({}, f.gv) : founderBreedingValues(rng, liabilitiesOn());
      for (const l of liabilitiesOn()) if (gv[l.key] === undefined) gv[l.key] = gaussian(rng) * Math.sqrt(l.h2);
      return makeRecord({ sex, name: f.name }, genotype, gv);
    }

    /** Breed a ram and a ewe. Lambs with two lethal alleles are lost, so a litter can be empty. */
    function breed(sireId, damId) {
      const s = rec(sireId);
      const d = rec(damId);
      if (!s || !d) throw new Error('Unknown sheep');
      if (s.sex !== 'ram' || d.sex !== 'ewe') throw new Error('Need a ram and a ewe');
      if (!breedingsLeft(sireId) || !breedingsLeft(damId)) throw new Error('Breeding limit reached');
      if (room() <= 0) throw new Error('Flock is full');
      const ss = secret.get(sireId);
      const ds = secret.get(damId);
      const probs = litterProbabilities(booroolaCopies(ds.genotype.booroola), d.inbreeding);
      const size = pickWeighted(rng, probs) + 1;
      const F = kinship(sireId, damId);
      const gen = Math.max(s.gen, d.gen) + 1;
      const lambs = [];
      let lost = 0;
      for (let i = 0; i < size; i++) {
        // Sex first: X-linked genes depend on it.
        const sex = rng() < 0.5 ? 'ram' : 'ewe';
        const genotype = inheritGenotype(rng, ss.genotype, ds.genotype, sex);
        if (lostOf(genotype)) { lost++; continue; }
        const gv = lambBreedingValues(rng, ss.gv, ds.gv, s.inbreeding, d.inbreeding, liabilitiesOn());
        lambs.push(makeRecord({ sex, gen, sire: sireId, dam: damId, inbreeding: F }, genotype, gv));
      }
      const event = { id: 'L' + nextEvent++, sire: sireId, dam: damId, lambs: lambs.map(l => l.id) };
      if (lost) event.lost = lost;
      const litter = mate => Object.assign({ event: event.id, mate, lambs: event.lambs.slice() }, lost ? { lost } : {});
      s.litters.push(litter(damId));
      d.litters.push(litter(sireId));
      history.push(event);
      if (history.length > HISTORY_LIMIT) history.shift();
      return { event, lambs, lost };
    }

    function undoLastBreeding() {
      const event = history.pop();
      if (!event) return null;
      for (const id of event.lambs) { sheep.delete(id); secret.delete(id); }
      for (const pid of [event.sire, event.dam]) {
        const p = rec(pid);
        if (p) p.litters = p.litters.filter(l => l.event !== event.id);
      }
      kinMemo = new Map();
      return event;
    }

    // Estimated breeding value from measured fleece of the sheep and its
    // ancestors. Uses only public records.
    function estimate(id, trait, memo) {
      const r = rec(id);
      if (!r) return trait.mean;
      const mk = id + ':' + trait.key;
      if (memo.has(mk)) return memo.get(mk);
      const family = r.sire && r.dam
        ? (estimate(r.sire, trait, memo) + estimate(r.dam, trait, memo)) / 2
        : trait.mean;
      const own = r.phenotype.fleece[trait.key] - inbreedingShift(trait, r.inbreeding);
      const v = family + trait.h2 * (own - family);
      memo.set(mk, v);
      return v;
    }

    /** Expected measured fleece of a lamb from this pairing, with an 80% range. */
    function predictFleece(sireId, damId) {
      const F = kinship(sireId, damId);
      const memo = new Map();
      const out = {};
      for (const t of TRAITS) {
        const mean = (estimate(sireId, t, memo) + estimate(damId, t, memo)) / 2 + inbreedingShift(t, F);
        const spread = 1.2816 * t.sd * Math.sqrt(1 - (t.h2 * t.h2) / 2);
        out[t.key] = {
          mean: round1(clamp(mean, t.min, t.max)),
          low: round1(clamp(mean - spread, t.min, t.max)),
          high: round1(clamp(mean + spread, t.min, t.max)),
        };
      }
      return out;
    }

    // Estimated hidden score of a threshold trait, the same way as fleece. A
    // sheep's own value is the average score of sheep that do (or don't) pass.
    function scoreEstimate(id, l, memo) {
      const r = rec(id);
      if (!r) return 0;
      const mk = id + ':' + l.key;
      if (memo.has(mk)) return memo.get(mk);
      const family = r.sire && r.dam ? (scoreEstimate(r.sire, l, memo) + scoreEstimate(r.dam, l, memo)) / 2 : 0;
      const t = l.threshold;
      const own = r.phenotype[l.field] ? normPdf(t) / (1 - normCdf(t)) : -normPdf(t) / normCdf(t);
      const v = family + l.h2 * (own - family);
      memo.set(mk, v);
      return v;
    }

    /** Chance a lamb from this pairing is gilded, from public records. Null without fantasy genes. */
    function predictGilded(sireId, damId) {
      if (!fantasy) return null;
      const l = LIABILITIES[0];
      const memo = new Map();
      const mid = (scoreEstimate(sireId, l, memo) + scoreEstimate(damId, l, memo)) / 2;
      return 1 - normCdf((l.threshold - mid) / Math.sqrt(1 - l.h2 / 2));
    }

    /**
     * Check the guesses a player is sure of against the real genotype.
     * sure is { gene: [allele | null, allele | null] }, with null for slots
     * that aren't sure. Order within a gene doesn't matter. ruledOut is
     * { gene: [allele, ...] } of alleles the player says it doesn't have.
     * Returns only how many statements were checked and which were wrong,
     * as { gene, slot } or { gene, ruledOut }, never the right answer.
     */
    function checkSureGuesses(id, sure, ruledOut) {
      const s = secret.get(id);
      if (!s) return null;
      let checked = 0;
      const wrong = [];
      for (const gene of genesOn()) {
        const slots = sure && sure[gene.key];
        if (!slots) continue;
        const pool = s.genotype[gene.key].slice();
        slots.forEach((a, i) => {
          if (a == null || a === UNKNOWN) return;
          checked++;
          const k = pool.indexOf(a);
          if (k >= 0) pool.splice(k, 1);
          else wrong.push({ gene: gene.key, slot: i });
        });
      }
      for (const gene of genesOn()) {
        for (const a of (ruledOut && ruledOut[gene.key]) || []) {
          checked++;
          if (s.genotype[gene.key].includes(a)) wrong.push({ gene: gene.key, ruledOut: a });
        }
      }
      return { checked, wrong };
    }

    function exportState() {
      const s = {};
      for (const [id, v] of secret) s[id] = v;
      return {
        v: 2,
        fantasy,
        devGenes: devGenes.slice(),
        nextId, serial, nextEvent,
        sheep: [...sheep.values()].map(r => JSON.parse(JSON.stringify(r))),
        history: JSON.parse(JSON.stringify(history)),
        secret: encodeSecret(s),
      };
    }

    /** Loads v2 saves, and v1 saves (from before fantasy genes) as base flocks. */
    function importState(state) {
      if (!state || (state.v !== 1 && state.v !== 2) || !Array.isArray(state.sheep)) throw new Error('Not a flock save');
      const s = decodeSecret(state.secret);
      const nextSheep = new Map();
      const nextSecret = new Map();
      for (const r of state.sheep) {
        if (!r || !r.id || !s[r.id]) throw new Error('Save is missing data for ' + (r && r.name));
        // Older saves could remove a sheep from the flock; that's retiring now.
        if (r.removed) r.retired = true;
        delete r.removed;
        nextSheep.set(r.id, r);
        nextSecret.set(r.id, s[r.id]);
      }
      sheep = nextSheep;
      secret = nextSecret;
      fantasy = state.v === 2 && !!state.fantasy;
      // Saves from before devGenes was stored: a dev gene is on if the genotypes have it.
      const anyGenotype = s[state.sheep[0] && state.sheep[0].id];
      devGenes = !fantasy ? []
        : Array.isArray(state.devGenes) ? devKeys(state.devGenes)
        : FANTASY_GENES.filter(g => g.dev && anyGenotype && anyGenotype.genotype[g.key]).map(g => g.key);
      history = Array.isArray(state.history) ? state.history : [];
      nextId = state.nextId;
      serial = state.serial;
      nextEvent = state.nextEvent || 1;
      kinMemo = new Map();
    }

    const api = {
      get fantasy() { return fantasy; },
      activeGenes: () => genesOn().slice(),
      list: () => [...sheep.values()],
      get: rec,
      addSheep,
      breed,
      breedingsLeft,
      room,
      maxSize,
      canUndo: () => history.length > 0,
      lastBreeding: () => history[history.length - 1] || null,
      undoLastBreeding,
      rename(id, name) { const r = rec(id); if (r && name) r.name = name; },
      retire(id) { const r = rec(id); if (r) r.retired = true; },
      unretire,
      kinship,
      offspringInbreeding: (sireId, damId) => kinship(sireId, damId),
      relatedness,
      relatednessToFlock,
      diversity,
      predictFleece,
      predictGilded,
      checkSureGuesses,
      exportState,
      importState,
    };
    if (opts.debug) {
      api.peekGenotype = id => JSON.parse(JSON.stringify(secret.get(id).genotype));
      api.peekValues = id => Object.assign({}, secret.get(id).gv);
    }
    return api;
  }

  // -------------------------------------------------- guide helpers

  /** Hypothetical families for the heritability chart: parent average vs lamb. */
  function simulateFamilies(traitKey, n, seed) {
    const rng = mulberry32(seed || 7);
    const t = TRAIT[traitKey];
    const out = [];
    for (let i = 0; i < n; i++) {
      const sGv = founderBreedingValues(rng);
      const dGv = founderBreedingValues(rng);
      const sire = measureFleece(rng, sGv, 0)[traitKey];
      const dam = measureFleece(rng, dGv, 0)[traitKey];
      const lamb = measureFleece(rng, lambBreedingValues(rng, sGv, dGv, 0, 0), 0)[traitKey];
      out.push({ sire, dam, parentAvg: round1((sire + dam) / 2), lamb });
    }
    return { trait: t, families: out };
  }

  /** Hypothetical families for the gilded chart, with the hidden scores shown. */
  function simulateGildFamilies(n, seed) {
    const rng = mulberry32(seed || 5);
    const l = LIABILITIES[0];
    const score = gv => round2(gv + gaussian(rng) * Math.sqrt(1 - l.h2));
    const out = [];
    for (let i = 0; i < n; i++) {
      const sGv = gaussian(rng) * Math.sqrt(l.h2);
      const dGv = gaussian(rng) * Math.sqrt(l.h2);
      const sire = score(sGv);
      const dam = score(dGv);
      const lamb = score((sGv + dGv) / 2 + gaussian(rng) * Math.sqrt(l.h2 / 2));
      out.push({ sire, dam, parentAvg: round2((sire + dam) / 2), lamb, gilded: lamb > l.threshold });
    }
    return { liability: l, families: out };
  }

  const SheepEngine = {
    UNKNOWN, GENES, BASE_GENES, FANTASY_GENES, GENE, COLOR_GENES, TRAITS, TRAIT, LIABILITIES, LITTER_TABLE,
    INBREEDING_FLEECE_PENALTY, INBREEDING_LITTER_PENALTY, BREEDING_LIMIT, MAX_FLOCK_SIZE, SPECKLE_MUTATION_RATE,
    allele, alleleIds, allowedAlleles,
    phenotypeOf, colorOf, colorKey, lookKey,
    litterProbabilities, normCdf,
    blankGuess, predictOutcomes, predictOffspring, checkLamb, checkSelf,
    goalGenes, meetsGoal, goalStatus, predictGoal,
    createFlock, randomGenotype, inheritGenotype, mulberry32,
    simulateFamilies, simulateGildFamilies,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SheepEngine;
  else root.SheepEngine = SheepEngine;
})(typeof window !== 'undefined' ? window : globalThis);
