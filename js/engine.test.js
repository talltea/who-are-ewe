/* Engine checks. Prints outcomes as plain text.
 * Browser: open test.html.  Node: node js/engine.test.js
 */
(function (root) {
  'use strict';

  function run(E, print) {
    let failures = 0;
    let checks = 0;
    const pct = v => (v * 100).toFixed(1) + '%';
    function check(label, ok, detail) {
      checks++;
      if (!ok) failures++;
      print((ok ? '  ok   ' : '  FAIL ') + label + (detail ? '  (' + detail + ')' : ''));
    }
    function near(label, actual, expected, tol) {
      check(label, Math.abs(actual - expected) <= tol, 'got ' + actual.toFixed(4) + ', want ' + expected + ' ± ' + tol);
    }
    function heading(t) { print(''); print('== ' + t); }

    const base = {
      agouti: ['solid', 'solid'], extension: ['normal', 'normal'], brown: ['normal', 'normal'],
      spotting: ['normal', 'normal'], horns: ['polled', 'polled'], booroola: ['plus', 'plus'],
    };
    const geno = over => Object.assign({}, base, over);
    const look = (over, sex) => E.phenotypeOf(geno(over), sex || 'ewe');
    const desc = l => l.color + ' ' + l.pattern + (l.spotted ? ' spotted' : '') + (l.horned ? ', horned' : ', polled');

    // ------------------------------------------------------------------
    heading('Phenotype rules');
    const cases = [
      [{ agouti: ['white', 'solid'] }, 'white none, polled'],
      [{ agouti: ['white', 'badgerface'], extension: ['black', 'black'], spotting: ['spotted', 'spotted'] }, 'white none, polled'],
      [{ extension: ['black', 'normal'], agouti: ['badgerface', 'mouflon'] }, 'black solid, polled'],
      [{ extension: ['black', 'normal'], brown: ['brown', 'brown'] }, 'brown solid, polled'],
      [{ agouti: ['badgerface', 'solid'] }, 'black badgerface, polled'],
      [{ agouti: ['mouflon', 'mouflon'], brown: ['brown', 'brown'] }, 'brown mouflon, polled'],
      [{ agouti: ['badgerface', 'mouflon'] }, 'black mixed, polled'],
      [{ brown: ['normal', 'brown'] }, 'black solid, polled'],
      [{ spotting: ['spotted', 'spotted'] }, 'black solid spotted, polled'],
      [{ spotting: ['normal', 'spotted'] }, 'black solid, polled'],
    ];
    for (const [over, want] of cases) {
      const got = desc(look(over));
      check(JSON.stringify(over) + ' -> ' + got, got === want, got === want ? '' : 'want ' + want);
    }
    for (const [pair, ram, ewe] of [[['horned', 'horned'], true, true], [['horned', 'polled'], true, false], [['polled', 'polled'], false, false]]) {
      const r = look({ horns: pair }, 'ram').horned;
      const e = look({ horns: pair }, 'ewe').horned;
      check('horns ' + pair.join('/') + ': ram ' + (r ? 'horned' : 'polled') + ', ewe ' + (e ? 'horned' : 'polled'), r === ram && e === ewe);
    }

    // ------------------------------------------------------------------
    heading('Mendelian ratios (20,000 lambs each)');
    const rng = E.mulberry32(12345);
    function ratio(sireOver, damOver, predicate, sex) {
      const s = geno(sireOver);
      const d = geno(damOver);
      let hit = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) {
        const g = E.inheritGenotype(rng, s, d);
        if (predicate(E.phenotypeOf(g, sex || 'ewe'), g)) hit++;
      }
      return hit / n;
    }
    near('white Aw/Aa x Aw/Aa -> colored lambs ≈ 25%',
      ratio({ agouti: ['white', 'solid'] }, { agouti: ['white', 'solid'] }, l => l.color !== 'white'), 0.25, 0.015);
    near('B/b x B/b -> moorit ≈ 25%',
      ratio({ brown: ['normal', 'brown'] }, { brown: ['normal', 'brown'] }, l => l.color === 'brown'), 0.25, 0.015);
    near('Abf/Aa x Amf/Aa -> mixed ≈ 25%',
      ratio({ agouti: ['badgerface', 'solid'] }, { agouti: ['mouflon', 'solid'] }, l => l.pattern === 'mixed'), 0.25, 0.015);
    near('S/s x s/s -> spotted ≈ 50%',
      ratio({ spotting: ['normal', 'spotted'] }, { spotting: ['spotted', 'spotted'] }, l => l.spotted), 0.5, 0.015);
    near('H/P x H/P -> ram lambs horned ≈ 75%',
      ratio({ horns: ['horned', 'polled'] }, { horns: ['horned', 'polled'] }, l => l.horned, 'ram'), 0.75, 0.015);
    near('H/P x H/P -> ewe lambs horned ≈ 25%',
      ratio({ horns: ['horned', 'polled'] }, { horns: ['horned', 'polled'] }, l => l.horned, 'ewe'), 0.25, 0.015);

    // ------------------------------------------------------------------
    heading('Booroola litter size (mean of 20,000 litters)');
    for (const copies of [0, 1, 2]) {
      const pr = E.litterProbabilities(copies, 0);
      let sum = 0;
      for (let i = 0; i < 20000; i++) {
        let r = rng();
        let k = 0;
        while (k < 2 && r >= pr[k]) { r -= pr[k]; k++; }
        sum += k + 1;
      }
      print('  ' + copies + ' copies: mean litter ' + (sum / 20000).toFixed(2) + '  [' + pr.map(pct).join(', ') + ']');
    }
    {
      const a = E.litterProbabilities(1, 0);
      const b = E.litterProbabilities(1, 0.25);
      check('inbred ewe (F=25%) has fewer twins/triplets', b[1] + b[2] < a[1] + a[2], pct(a[1] + a[2]) + ' -> ' + pct(b[1] + b[2]));
    }
    {
      const f = E.createFlock({ rng: E.mulberry32(9), debug: true });
      const ram = f.addSheep({ sex: 'ram', genotype: geno({}) });
      const sizes = [0, 0, 0];
      for (let i = 0; i < 1500; i++) {
        const ewe = f.addSheep({ sex: 'ewe', genotype: geno({ booroola: ['carrier', 'carrier'] }) });
        sizes[f.breed(ram.id, ewe.id).lambs.length - 1]++;
      }
      print('  flock.breed with 2-copy ewes: litters of 1/2/3 = ' + sizes.join(' / '));
      check('every litter has 1-3 lambs', sizes.reduce((a, b) => a + b) === 1500);
    }

    // ------------------------------------------------------------------
    heading('Fleece heritability (regression of lamb on parent average ≈ h²)');
    for (const t of E.TRAITS) {
      const { families } = E.simulateFamilies(t.key, 6000, 21);
      const xs = families.map(f => f.parentAvg);
      const ys = families.map(f => f.lamb);
      const mx = xs.reduce((a, b) => a + b) / xs.length;
      const my = ys.reduce((a, b) => a + b) / ys.length;
      let sxy = 0;
      let sxx = 0;
      for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
      near(t.name + ' slope (h² = ' + t.h2 + ')', sxy / sxx, t.h2, 0.07);
    }

    // ------------------------------------------------------------------
    heading('Inbreeding coefficients from pedigrees');
    {
      const f = E.createFlock({ rng: E.mulberry32(3), debug: true });
      const ram = f.addSheep({ sex: 'ram' });
      const ewe = f.addSheep({ sex: 'ewe' });
      const ewe2 = f.addSheep({ sex: 'ewe' });
      check('unrelated founders: lamb F = 0', f.offspringInbreeding(ram.id, ewe.id) === 0);
      // Force lambs of each sex by breeding until we have them.
      const kids = (s, d, sex) => {
        for (let i = 0; i < 200; i++) {
          const found = f.breed(s, d).lambs.find(l => l.sex === sex);
          if (found) return found;
        }
        throw new Error('no ' + sex);
      };
      const son = kids(ram.id, ewe.id, 'ram');
      const daughter = kids(ram.id, ewe.id, 'ewe');
      const halfDaughter = kids(ram.id, ewe2.id, 'ewe');
      near('full siblings -> 25%', f.offspringInbreeding(son.id, daughter.id), 0.25, 1e-9);
      near('half siblings -> 12.5%', f.offspringInbreeding(son.id, halfDaughter.id), 0.125, 1e-9);
      near('sire x daughter -> 25%', f.offspringInbreeding(ram.id, daughter.id), 0.25, 1e-9);
      const g2son = kids(son.id, daughter.id, 'ram');
      const g2dau = kids(son.id, daughter.id, 'ewe');
      check('full-sib lamb records F = 25%', Math.abs(g2son.inbreeding - 0.25) < 1e-9);
      near('two generations of full-sib mating -> 37.5%', f.offspringInbreeding(g2son.id, g2dau.id), 0.375, 1e-9);
      check('generation numbers: founders 0, lambs 1, grandlambs 2', ram.gen === 0 && son.gen === 1 && g2son.gen === 2);
    }

    // ------------------------------------------------------------------
    heading('Predictions from guesses');
    const guess = over => Object.assign(E.blankGuess(), over);
    const known = {
      extension: ['normal', 'normal'], brown: ['normal', 'normal'], spotting: ['normal', 'normal'],
    };
    {
      const p = E.predictOffspring(
        guess(Object.assign({ agouti: ['white', 'solid'] }, known)),
        guess(Object.assign({ agouti: ['white', 'solid'] }, known)));
      const white = p.colors.find(o => o.value.color === 'white');
      const black = p.colors.find(o => o.value.color === 'black');
      check('fully known Aw/Aa x Aw/Aa: white 75%, black 25%',
        white.min === 0.75 && white.max === 0.75 && black.min === 0.25 && black.max === 0.25,
        p.colors.map(o => E.colorKey(o.value) + ' ' + pct(o.min) + '-' + pct(o.max)).join('; '));
    }
    {
      const p = E.predictOffspring(
        guess(Object.assign({}, known, { agouti: ['solid', 'solid'], brown: ['normal', '?'] })),
        guess(Object.assign({}, known, { agouti: ['solid', 'solid'], brown: ['brown', 'brown'] })));
      const moorit = p.colors.find(o => o.value.color === 'brown');
      check('ram B/? x moorit ewe: moorit 0-50%, depends on ram\'s Brown',
        moorit.min === 0 && moorit.max === 0.5 && moorit.depends.length === 1 &&
        moorit.depends[0].gene === 'brown' && moorit.depends[0].parent === 'sire',
        pct(moorit.min) + '-' + pct(moorit.max));
    }
    {
      const p = E.predictOffspring(E.blankGuess(), E.blankGuess());
      const sums = p.colors.reduce((a, o) => [a[0] + o.min, a[1] + o.max], [0, 0]);
      check('all-unknown parents: every outcome 0-100%', p.colors.every(o => o.min === 0 && o.max === 1), p.colors.length + ' outcomes');
      check('ranges bracket 100%', sums[0] <= 1 + 1e-9 && sums[1] >= 1 - 1e-9);
    }
    {
      const p = E.predictOffspring(guess({ horns: ['horned', 'polled'] }), guess({ horns: ['horned', 'polled'] }));
      check('horns H/P x H/P: rams 75%, ewes 25%',
        p.horns.ram.min === 0.75 && p.horns.ram.max === 0.75 && p.horns.ewe.min === 0.25 && p.horns.ewe.max === 0.25);
      const q = E.predictOffspring(guess({ horns: ['polled', 'polled'] }), guess({ horns: ['?', 'polled'] }));
      check('horns P/P x ?/P: ram lambs 0-50% horned, ewe lambs 0%',
        q.horns.ram.min === 0 && q.horns.ram.max === 0.5 && q.horns.ewe.max === 0);
    }
    {
      const p = E.predictOffspring(guess({ booroola: ['carrier', 'plus'] }), guess({ booroola: ['carrier', 'plus'] }));
      check('Booroola carrier x carrier: 25/50/25', p.booroola.map(o => o.min).join() === '0.25,0.5,0.25');
    }

    // ------------------------------------------------------------------
    heading('Surprise checks');
    {
      const moorit = { sex: 'ewe', color: 'brown', pattern: 'solid', spotted: false, horned: false };
      const ok = E.checkLamb(moorit,
        guess({ brown: ['normal', 'brown'] }), guess({ brown: ['normal', 'brown'] }));
      check('moorit lamb from B/b x B/b: no surprise', ok.length === 0);
      const one = E.checkLamb(moorit,
        guess({ brown: ['normal', 'normal'] }), guess({ brown: ['normal', 'brown'] }));
      check('moorit lamb from B/B x B/b: blames ram\'s Brown guess',
        one.length === 1 && one[0].genes.length === 1 && one[0].genes[0].gene === 'brown' && one[0].genes[0].culprit === 'sire',
        JSON.stringify(one));
      const both = E.checkLamb(moorit,
        guess({ brown: ['normal', 'normal'] }), guess({ brown: ['normal', 'normal'] }));
      check('moorit lamb from B/B x B/B: blames both parents',
        both.length === 1 && both[0].genes[0].culprit === 'both', JSON.stringify(both));
      const colored = { sex: 'ram', color: 'black', pattern: 'solid', spotted: false, horned: true };
      const white = E.checkLamb(colored,
        guess({ agouti: ['white', 'white'], horns: ['horned', '?'] }), guess({ agouti: ['white', 'solid'], horns: ['polled', 'polled'] }));
      check('colored lamb from Aw/Aw ram: blames the ram\'s Agouti', white.length === 1 &&
        white[0].trait === 'color' && white[0].genes[0].gene === 'agouti' && white[0].genes[0].culprit === 'sire', JSON.stringify(white));
      const hornedEwe = { sex: 'ewe', color: 'white', pattern: 'none', spotted: false, horned: true };
      const h = E.checkLamb(hornedEwe, guess({ horns: ['horned', 'polled'] }), guess({ horns: ['polled', 'polled'] }));
      check('horned ewe lamb from H/P x P/P: blames the ewe\'s Horns guess',
        h.length === 1 && h[0].trait === 'horns' && h[0].genes[0].culprit === 'dam', JSON.stringify(h));
      const self = E.checkSelf({ sex: 'ewe', color: 'black', pattern: 'solid', spotted: false, horned: false },
        guess({ agouti: ['white', '?'] }));
      check('black sheep guessed Aw/?: own guess flagged on Agouti', self.length === 1 && self[0].genes.join() === 'agouti');
    }

    // ------------------------------------------------------------------
    heading('Flock: undo, save and load');
    {
      const names = ['Juniper', 'Bramble', 'Clover', 'Thistle', 'Hazel', 'Rowan'];
      let n = 0;
      const f = E.createFlock({ rng: E.mulberry32(77), nameFor: () => names[n++ % names.length], debug: true });
      const ram = f.addSheep({ sex: 'ram' });
      const ewe = f.addSheep({ sex: 'ewe' });
      const { lambs } = f.breed(ram.id, ewe.id);
      check('breeding records the litter on both parents', ewe.litters.length === 1 && ram.litters[0].lambs.length === lambs.length);
      const lambGeno = f.peekGenotype(lambs[0].id);
      const sireGeno = f.peekGenotype(ram.id);
      const damGeno = f.peekGenotype(ewe.id);
      check('each lamb allele comes from the matching parent', E.GENES.every(g =>
        sireGeno[g.key].includes(lambGeno[g.key][0]) && damGeno[g.key].includes(lambGeno[g.key][1])));
      const state = f.exportState();
      const saved = JSON.stringify(state);
      check('public records carry no genotype', !/genotype|"gv"|carrier|polled|"horns"/.test(JSON.stringify(state.sheep)));
      check('hidden part is encoded, not plain text', !/genotype|agouti|carrier|polled/.test(state.secret));
      const g = E.createFlock({ debug: true });
      g.importState(JSON.parse(saved));
      check('load restores every sheep', g.list().length === f.list().length);
      check('load restores hidden genotypes', JSON.stringify(g.peekGenotype(lambs[0].id)) === JSON.stringify(lambGeno));
      const undone = f.undoLastBreeding();
      check('undo removes the lambs', undone && f.list().length === 2 && !f.get(lambs[0].id));
      check('undo clears the litter history', ewe.litters.length === 0 && ram.litters.length === 0);
      check('nothing left to undo', !f.canUndo());
    }

    // ------------------------------------------------------------------
    heading('Ruled-out alleles');
    {
      const plainRam = guess(Object.assign({ agouti: ['solid', 'solid'] }, known));
      const notWhite = Object.assign(guess(), { ruledOut: { agouti: ['white'] } });
      const anyEwe = E.predictOffspring(plainRam, guess());
      const solidEwe = E.predictOffspring(plainRam, notWhite);
      check('a "?" can be anything: white lambs possible', anyEwe.colors.some(o => o.value.color === 'white'));
      check('ruling out white on the ewe: no white lambs', !solidEwe.colors.some(o => o.value.color === 'white'),
        solidEwe.colors.map(o => E.colorKey(o.value)).join(', '));
      check('ruling out every allele still leaves a "?" open', E.allowedAlleles({ ruledOut: { brown: ['normal', 'brown'] } }, 'brown').length === 2);
      const whiteLook = { sex: 'ewe', color: 'white', pattern: 'none', spotted: false, horned: false };
      const self = E.checkSelf(whiteLook, notWhite);
      check('white sheep with white ruled out: own notes flagged on Agouti', self.length === 1 && self[0].genes.join() === 'agouti');
      const lamb = E.checkLamb(whiteLook, notWhite, notWhite);
      check('white lamb from two parents with white ruled out: one of them is wrong', lamb.length === 1 && lamb[0].genes[0].culprit === 'either',
        JSON.stringify(lamb));
      const oneParent = E.checkLamb(whiteLook, notWhite, guess());
      check('white lamb, only the ram has white ruled out: no surprise', oneParent.length === 0);
    }

    // ------------------------------------------------------------------
    heading('Checking sure guesses');
    {
      const f = E.createFlock({ rng: E.mulberry32(5) });
      const ewe = f.addSheep({ sex: 'ewe', genotype: geno({ brown: ['normal', 'brown'], horns: ['horned', 'polled'] }) });
      const run = sure => f.checkSureGuesses(ewe.id, sure);
      const none = run({ brown: [null, null] });
      check('nothing sure: nothing checked', none.checked === 0 && none.wrong.length === 0);
      const right = run({ brown: ['brown', 'normal'], horns: ['polled', null], agouti: ['solid', 'solid'] });
      check('right guesses pass, in either order', right.checked === 5 && right.wrong.length === 0, JSON.stringify(right));
      const oneB = run({ brown: ['brown', null] });
      check('one sure b on a B/b sheep passes', oneB.wrong.length === 0);
      const twoB = run({ brown: ['brown', 'brown'] });
      check('sure b/b on a B/b sheep flags exactly one slot', twoB.wrong.length === 1 && twoB.wrong[0].gene === 'brown', JSON.stringify(twoB));
      const bad = run({ extension: [null, 'black'], horns: ['horned', 'horned'] });
      check('wrong slots are named by gene and slot', bad.checked === 3 && bad.wrong.length === 2 &&
        bad.wrong.some(w => w.gene === 'extension' && w.slot === 1) && bad.wrong.some(w => w.gene === 'horns'), JSON.stringify(bad));
      check('result never includes the genotype', !/normal|polled|carrier/.test(JSON.stringify(bad)));
      const outRight = f.checkSureGuesses(ewe.id, {}, { extension: ['black'], agouti: ['white', 'badgerface'] });
      check('right ruled-out alleles pass', outRight.checked === 3 && outRight.wrong.length === 0, JSON.stringify(outRight));
      const outWrong = f.checkSureGuesses(ewe.id, {}, { brown: ['brown'] });
      check('ruling out an allele it has is flagged', outWrong.wrong.length === 1 && outWrong.wrong[0].ruledOut === 'brown', JSON.stringify(outWrong));
    }

    print('');
    print(failures ? failures + ' of ' + checks + ' checks FAILED' : 'All ' + checks + ' checks passed');
    return failures;
  }

  if (typeof module !== 'undefined' && module.exports && require.main === module) {
    const E = require('./engine.js');
    process.exitCode = run(E, s => console.log(s)) ? 1 : 0;
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = run;
  } else {
    root.runEngineTests = run;
  }
})(typeof window !== 'undefined' ? window : globalThis);
