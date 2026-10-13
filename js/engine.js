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

  const GENES = [
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

  const GENE = {};
  for (const g of GENES) GENE[g.key] = g;
  const COLOR_GENES = ['agouti', 'extension', 'brown', 'spotting'];

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

  // Measured-value penalty, in phenotypic SDs per unit of inbreeding coefficient.
  const INBREEDING_FLEECE_PENALTY = 1.2;
  // Fraction of the chance of twins/triplets lost per unit of the ewe's inbreeding.
  const INBREEDING_LITTER_PENALTY = 1.2;

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

  // ---------------------------------------------------------- phenotype

  function colorOf(g) {
    const ag = g.agouti;
    if (ag[0] === 'white' || ag[1] === 'white') {
      return { color: 'white', pattern: 'none', spotted: false };
    }
    const color = g.brown[0] === 'brown' && g.brown[1] === 'brown' ? 'brown' : 'black';
    let pattern;
    if (g.extension[0] === 'black' || g.extension[1] === 'black') {
      pattern = 'solid';
    } else {
      const bf = ag.includes('badgerface');
      const mf = ag.includes('mouflon');
      pattern = bf && mf ? 'mixed' : bf ? 'badgerface' : mf ? 'mouflon' : 'solid';
    }
    const spotted = g.spotting[0] === 'spotted' && g.spotting[1] === 'spotted';
    return { color, pattern, spotted };
  }

  function hornedOf(pair, sex) {
    const n = (pair[0] === 'horned') + (pair[1] === 'horned');
    return n === 2 || (n === 1 && sex === 'ram');
  }

  function booroolaCopies(pair) {
    return (pair[0] === 'carrier') + (pair[1] === 'carrier');
  }

  /** Visible look of any genotype. Used by flocks and by the guide's examples. */
  function phenotypeOf(genotype, sex) {
    return Object.assign({ sex }, colorOf(genotype), { horned: hornedOf(genotype.horns, sex) });
  }

  function colorKey(look) {
    return look.color + '/' + look.pattern + '/' + (look.spotted ? 1 : 0);
  }

  // ------------------------------------------------------- inheritance

  function randomGenotype(rng, freqOverride) {
    const g = {};
    for (const gene of GENES) {
      const freq = Object.assign({}, gene.freq, freqOverride && freqOverride[gene.key]);
      const ids = gene.alleles.map(a => a.id);
      const w = ids.map(id => freq[id] || 0);
      g[gene.key] = [ids[pickWeighted(rng, w)], ids[pickWeighted(rng, w)]];
    }
    return g;
  }

  function inheritGenotype(rng, sireG, damG) {
    const g = {};
    for (const gene of GENES) {
      g[gene.key] = [sireG[gene.key][rng() < 0.5 ? 0 : 1], damG[gene.key][rng() < 0.5 ? 0 : 1]];
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

  function founderBreedingValues(rng) {
    const gv = {};
    for (const t of TRAITS) gv[t.key] = t.mean + gaussian(rng) * t.sd * Math.sqrt(t.h2);
    return gv;
  }

  function lambBreedingValues(rng, sireGv, damGv, sireF, damF) {
    const gv = {};
    for (const t of TRAITS) {
      // Mendelian sampling variance shrinks as the parents get more inbred.
      const msVar = (t.h2 / 2) * (1 - ((sireF || 0) + (damF || 0)) / 2);
      gv[t.key] = (sireGv[t.key] + damGv[t.key]) / 2 + gaussian(rng) * t.sd * Math.sqrt(msVar);
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

  // ---------------------------------------- predictions from guesses
  //
  // A guess is { gene: [allele | '?', allele | '?'] }, plus an optional
  // ruledOut: { gene: [allele, ...] } of alleles the player says it doesn't
  // have. A '?' then stands for any allele that isn't ruled out. Predictions
  // never look at real genotypes: only at what the player wrote.

  function blankGuess() {
    const g = {};
    for (const gene of GENES) g[gene.key] = [UNKNOWN, UNKNOWN];
    return g;
  }

  // Alleles a '?' slot can stand for under this guess.
  function allowedAlleles(guess, geneKey) {
    const ids = alleleIds(geneKey);
    const out = guess && guess.ruledOut && guess.ruledOut[geneKey];
    if (!out || !out.length) return ids;
    const left = ids.filter(a => !out.includes(a));
    return left.length ? left : ids;
  }

  // Lamb allele pairs for one gene, as [fromSire, fromDam] with probabilities.
  // A '?' at index 0 is the sire's unknown allele, at index 1 the dam's.
  function lambPairs(sireSlots, damSlots) {
    const map = new Map();
    for (const a of sireSlots) {
      for (const b of damSlots) {
        const key = a + '|' + b;
        const cur = map.get(key);
        if (cur) cur.p += 0.25;
        else map.set(key, { pair: [a, b], p: 0.25 });
      }
    }
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

  // Offspring outcome probabilities. Each outcome gets a range [min, max]:
  // min is certain under the guesses, max adds lambs whose look hinges on a '?'.
  function predictOutcomes(sireGuess, damGuess, genes, evaluate) {
    const perGene = genes.map(g => lambPairs(sireGuess[g], damGuess[g]));
    const optsFor = (g, idx) => allowedAlleles(idx === 0 ? sireGuess : damGuess, g);
    const results = new Map();
    const combo = {};
    function add(res, p, certain, influencers) {
      let o = results.get(res.key);
      if (!o) { o = { key: res.key, value: res.value, min: 0, max: 0, depends: [] }; results.set(res.key, o); }
      o.max += p;
      if (certain) o.min += p;
      for (const inf of influencers) {
        if (!o.depends.some(d => d.gene === inf.gene && d.parent === inf.parent)) o.depends.push(inf);
      }
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
    for (const o of list) { o.min = round4(o.min); o.max = round4(o.max); }
    return list.sort((a, b) => b.max - a.max || b.min - a.min);
  }

  const round4 = v => Math.round(v * 1e4) / 1e4;

  function predictOffspring(sireGuess, damGuess) {
    const colors = predictOutcomes(sireGuess, damGuess, COLOR_GENES, g => {
      const look = colorOf(g);
      return { key: colorKey(look), value: look };
    });
    const horns = {};
    for (const sex of ['ram', 'ewe']) {
      const res = predictOutcomes(sireGuess, damGuess, ['horns'], g => {
        const h = hornedOf(g.horns, sex);
        return { key: h ? 'horned' : 'polled', value: h };
      });
      const horned = res.find(o => o.key === 'horned');
      horns[sex] = horned
        ? { min: horned.min, max: horned.max, depends: horned.depends }
        : { min: 0, max: 0, depends: [] };
    }
    const booroola = predictOutcomes(sireGuess, damGuess, ['booroola'], g => {
      const n = booroolaCopies(g.booroola);
      return { key: String(n), value: n };
    }).sort((a, b) => a.value - b.value);
    return { colors, horns, booroola };
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
  function pairsFromParents(geneKey, sireSlots, damSlots, sireAllowed, damAllowed) {
    const s = uniq(sireSlots.flatMap(a => expandSlot(geneKey, a, sireAllowed)));
    const d = uniq(damSlots.flatMap(a => expandSlot(geneKey, a, damAllowed)));
    return cross(s, d);
  }

  // Every allele pair a sheep could carry, given its own guess.
  function pairsFromOwn(geneKey, slots, allowed) {
    return cross(expandSlot(geneKey, slots[0], allowed), expandSlot(geneKey, slots[1], allowed));
  }

  function allPairs(geneKey) {
    const ids = alleleIds(geneKey);
    return cross(ids, ids);
  }

  function colorPossible(pairs, look) {
    const want = colorKey(look);
    const g = {};
    for (const ag of pairs.agouti) {
      g.agouti = ag;
      for (const ex of pairs.extension) {
        g.extension = ex;
        for (const br of pairs.brown) {
          g.brown = br;
          for (const sp of pairs.spotting) {
            g.spotting = sp;
            if (colorKey(colorOf(g)) === want) return true;
          }
        }
      }
    }
    return false;
  }

  function hornsPossible(pairs, look) {
    return pairs.horns.some(p => hornedOf(p, look.sex) === look.horned);
  }

  const TRAIT_GROUPS = [
    { trait: 'color', genes: COLOR_GENES, possible: colorPossible },
    { trait: 'horns', genes: ['horns'], possible: hornsPossible },
  ];

  function subsetsBySize(items) {
    const out = [];
    for (let mask = 1; mask < (1 << items.length); mask++) {
      out.push(items.filter((_, i) => mask & (1 << i)));
    }
    return out.sort((a, b) => a.length - b.length);
  }

  /**
   * Does a lamb's look fit its parents' guesses? Returns a list of issues, one
   * per impossible trait, each naming the gene guesses that would have to give.
   * culprit is 'sire' or 'dam' (that parent's guess alone), 'either' (one of
   * the two), or 'both' (both parents' guesses).
   */
  function checkLamb(look, sireGuess, damGuess) {
    const issues = [];
    for (const grp of TRAIT_GROUPS) {
      const build = relax => {
        const pairs = {};
        for (const g of grp.genes) {
          // A relaxed guess drops both its slots and its ruled-out alleles.
          const relaxS = relax[g] === 'sire' || relax[g] === 'both';
          const relaxD = relax[g] === 'dam' || relax[g] === 'both';
          pairs[g] = pairsFromParents(g,
            relaxS ? [UNKNOWN, UNKNOWN] : sireGuess[g], relaxD ? [UNKNOWN, UNKNOWN] : damGuess[g],
            relaxS ? null : allowedAlleles(sireGuess, g), relaxD ? null : allowedAlleles(damGuess, g));
        }
        return pairs;
      };
      if (grp.possible(build({}), look)) continue;
      let found = null;
      for (const subset of subsetsBySize(grp.genes)) {
        const relax = {};
        for (const g of subset) relax[g] = 'both';
        if (grp.possible(build(relax), look)) { found = subset; break; }
      }
      if (!found) continue; // cannot happen: fully relaxed guesses allow any look
      const genes = found.map(g => {
        const relax = {};
        for (const o of found) relax[o] = 'both';
        relax[g] = 'sire';
        const sireAlone = grp.possible(build(relax), look);
        relax[g] = 'dam';
        const damAlone = grp.possible(build(relax), look);
        const culprit = sireAlone && damAlone ? 'either' : sireAlone ? 'sire' : damAlone ? 'dam' : 'both';
        return { gene: g, culprit };
      });
      issues.push({ trait: grp.trait, genes });
    }
    return issues;
  }

  /** Does a sheep's own guess fit how it looks? Returns the genes that clash. */
  function checkSelf(look, guess) {
    const issues = [];
    for (const grp of TRAIT_GROUPS) {
      const build = relaxed => {
        const pairs = {};
        for (const g of grp.genes) {
          pairs[g] = relaxed.includes(g) ? allPairs(g) : pairsFromOwn(g, guess[g], allowedAlleles(guess, g));
        }
        return pairs;
      };
      if (grp.possible(build([]), look)) continue;
      for (const subset of subsetsBySize(grp.genes)) {
        if (grp.possible(build(subset), look)) { issues.push({ trait: grp.trait, genes: subset }); break; }
      }
    }
    return issues;
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

  /**
   * A flock: public sheep records plus a private store of genotypes.
   *
   * options.rng        random function (defaults to Math.random)
   * options.nameFor    function(sex) -> name for new sheep
   * options.debug      expose peekGenotype() for the test page
   */
  function createFlock(options) {
    const opts = options || {};
    const rng = opts.rng || Math.random;
    const nameFor = opts.nameFor || (() => 'Sheep ' + nextId);

    let sheep = new Map();    // id -> public record
    let secret = new Map();   // id -> { genotype, gv }
    let history = [];         // breeding events, newest last
    let nextId = 1;
    let serial = 0;
    let nextEvent = 1;
    let kinMemo = new Map();
    const HISTORY_LIMIT = 50;

    function rec(id) { return sheep.get(id) || null; }

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
        phenotype: Object.assign(phenotypeOf(genotype, fields.sex), {
          fleece: measureFleece(rng, gv, fields.inbreeding || 0),
        }),
        litters: [],
        removed: false,
      };
      sheep.set(id, r);
      secret.set(id, { genotype, gv });
      return r;
    }

    function addSheep(fields) {
      const f = fields || {};
      const sex = f.sex || (rng() < 0.5 ? 'ram' : 'ewe');
      const genotype = f.genotype ? cloneGenotype(f.genotype) : randomGenotype(rng, f.freq);
      const gv = f.gv ? Object.assign({}, f.gv) : founderBreedingValues(rng);
      return makeRecord({ sex, name: f.name }, genotype, gv);
    }

    function breed(sireId, damId) {
      const s = rec(sireId);
      const d = rec(damId);
      if (!s || !d) throw new Error('Unknown sheep');
      if (s.sex !== 'ram' || d.sex !== 'ewe') throw new Error('Need a ram and a ewe');
      if (s.removed || d.removed) throw new Error('Both parents must be in the flock');
      const ss = secret.get(sireId);
      const ds = secret.get(damId);
      const probs = litterProbabilities(booroolaCopies(ds.genotype.booroola), d.inbreeding);
      const size = pickWeighted(rng, probs) + 1;
      const F = kinship(sireId, damId);
      const gen = Math.max(s.gen, d.gen) + 1;
      const lambs = [];
      for (let i = 0; i < size; i++) {
        const genotype = inheritGenotype(rng, ss.genotype, ds.genotype);
        const gv = lambBreedingValues(rng, ss.gv, ds.gv, s.inbreeding, d.inbreeding);
        const sex = rng() < 0.5 ? 'ram' : 'ewe';
        lambs.push(makeRecord({ sex, gen, sire: sireId, dam: damId, inbreeding: F }, genotype, gv));
      }
      const event = { id: 'L' + nextEvent++, sire: sireId, dam: damId, lambs: lambs.map(l => l.id) };
      s.litters.push({ event: event.id, mate: damId, lambs: event.lambs.slice() });
      d.litters.push({ event: event.id, mate: sireId, lambs: event.lambs.slice() });
      history.push(event);
      if (history.length > HISTORY_LIMIT) history.shift();
      return { event, lambs };
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
      for (const gene of GENES) {
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
      for (const gene of GENES) {
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
        v: 1,
        nextId, serial, nextEvent,
        sheep: [...sheep.values()].map(r => JSON.parse(JSON.stringify(r))),
        history: JSON.parse(JSON.stringify(history)),
        secret: encodeSecret(s),
      };
    }

    function importState(state) {
      if (!state || state.v !== 1 || !Array.isArray(state.sheep)) throw new Error('Not a flock save');
      const s = decodeSecret(state.secret);
      const nextSheep = new Map();
      const nextSecret = new Map();
      for (const r of state.sheep) {
        if (!r || !r.id || !s[r.id]) throw new Error('Save is missing data for ' + (r && r.name));
        nextSheep.set(r.id, r);
        nextSecret.set(r.id, s[r.id]);
      }
      sheep = nextSheep;
      secret = nextSecret;
      history = Array.isArray(state.history) ? state.history : [];
      nextId = state.nextId;
      serial = state.serial;
      nextEvent = state.nextEvent || 1;
      kinMemo = new Map();
    }

    const api = {
      list: (o) => [...sheep.values()].filter(r => (o && o.includeRemoved) || !r.removed),
      get: rec,
      addSheep,
      breed,
      canUndo: () => history.length > 0,
      lastBreeding: () => history[history.length - 1] || null,
      undoLastBreeding,
      rename(id, name) { const r = rec(id); if (r && name) r.name = name; },
      remove(id) { const r = rec(id); if (r) r.removed = true; },
      restore(id) { const r = rec(id); if (r) r.removed = false; },
      kinship,
      offspringInbreeding: (sireId, damId) => kinship(sireId, damId),
      predictFleece,
      checkSureGuesses,
      exportState,
      importState,
    };
    if (opts.debug) api.peekGenotype = id => cloneGenotype(secret.get(id).genotype);
    return api;
  }

  function cloneGenotype(g) {
    const c = {};
    for (const gene of GENES) c[gene.key] = g[gene.key].slice();
    return c;
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

  const SheepEngine = {
    UNKNOWN, GENES, GENE, COLOR_GENES, TRAITS, TRAIT, LITTER_TABLE,
    INBREEDING_FLEECE_PENALTY, INBREEDING_LITTER_PENALTY,
    allele, alleleIds, allowedAlleles,
    phenotypeOf, colorKey,
    litterProbabilities,
    blankGuess, predictOffspring, checkLamb, checkSelf,
    createFlock, randomGenotype, inheritGenotype, mulberry32,
    simulateFamilies,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SheepEngine;
  else root.SheepEngine = SheepEngine;
})(typeof window !== 'undefined' ? window : globalThis);
