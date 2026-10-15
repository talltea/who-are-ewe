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
      const sizes = [0, 0, 0];
      for (let i = 0; i < 1500; i++) {
        const ram = f.addSheep({ sex: 'ram', genotype: geno({}) });
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
      check('relatedness: unrelated 0, full siblings 50%, half siblings 25%, parent and lamb 50%',
        f.relatedness(ram.id, ewe.id) === 0 && Math.abs(f.relatedness(son.id, daughter.id) - 0.5) < 1e-9 &&
        Math.abs(f.relatedness(son.id, halfDaughter.id) - 0.25) < 1e-9 && Math.abs(f.relatedness(ram.id, daughter.id) - 0.5) < 1e-9);
      near('inbred full siblings (F = 25%) are 60% related', f.relatedness(g2son.id, g2dau.id), 0.6, 1e-9);
      check('a sheep is 100% related to itself', Math.abs(f.relatedness(son.id, son.id) - 1) < 1e-9);
    }

    // ------------------------------------------------------------------
    heading('Relatedness to the flock and diversity');
    {
      const f = E.createFlock({ rng: E.mulberry32(5) });
      const a = f.addSheep({ sex: 'ram' });
      const b = f.addSheep({ sex: 'ewe' });
      const c = f.addSheep({ sex: 'ewe' });
      check('unrelated founders: diversity 100%, each 0% related to the flock',
        f.diversity() === 1 && [a, b, c].every(r => f.relatednessToFlock(r.id) === 0));
      // Keep one lamb of a and b breeding.
      const [lamb, ...rest] = f.breed(a.id, b.id).lambs;
      for (const r of rest) f.retire(r.id);
      // Breeding: a, b, c, lamb. Kinship of each parent with the lamb is 25%,
      // every other pair 0, so the 6 pairs average 0.5 / 6.
      near('diversity with one lamb of two founders', f.diversity(), 1 - 0.5 / 6, 1e-9);
      near('the lamb is 50% related to both parents and 0% to the third founder', f.relatednessToFlock(lamb.id), 1 / 3, 1e-9);
      near('a parent is related to the flock through its lamb only', f.relatednessToFlock(a.id), 1 / 6, 1e-9);
      check('the unrelated founder stays at 0%', f.relatednessToFlock(c.id) === 0);
      f.retire(lamb.id);
      check('retired sheep don\'t count toward relatedness or diversity',
        f.diversity() === 1 && f.relatednessToFlock(a.id) === 0);
      near('a retired sheep is still measured against the breeding flock', f.relatednessToFlock(lamb.id), 1 / 3, 1e-9);
      const one = E.createFlock({ rng: E.mulberry32(6) });
      const only = one.addSheep({ sex: 'ewe' });
      check('one breeding sheep: no diversity or relatedness to measure',
        one.diversity() === null && one.relatednessToFlock(only.id) === null);
    }

    // ------------------------------------------------------------------
    heading('Diversity history');
    {
      const f = E.createFlock({ rng: E.mulberry32(21) });
      const rams = [f.addSheep({ sex: 'ram' }), f.addSheep({ sex: 'ram' })];
      const ewes = [f.addSheep({ sex: 'ewe' }), f.addSheep({ sex: 'ewe' }), f.addSheep({ sex: 'ewe' })];
      // Breed, retire, add and breed again, noting diversity right after each litter.
      const seen = [];
      const litter = (s, d) => { const res = f.breed(s.id, d.id); seen.push(f.diversity()); return res.lambs; };
      const firstLambs = litter(rams[0], ewes[0]);
      litter(rams[0], ewes[1]);
      f.retire(firstLambs[0].id);
      f.retire(ewes[2].id);
      f.addSheep({ sex: 'ewe' });
      litter(rams[1], ewes[0]);
      for (let i = 0; i < 4; i++) litter(rams[0], ewes[1]); // ewe 1 uses up her breedings
      const kids = f.list().filter(r => r.sire && !r.retired);
      const kidRam = kids.find(r => r.sex === 'ram');
      const kidEwe = kids.find(r => r.sex === 'ewe');
      check('the test flock has a ram lamb and a ewe lamb to breed', !!(kidRam && kidEwe));
      litter(kidRam, kidEwe);
      f.retire(rams[1].id);
      const h = f.diversityHistory();
      const lits = h.filter(p => p.kind === 'litter');
      check('starts with the founders, at 100%', h[0].kind === 'start' && h[0].value === 1 && h[0].breeders === 5);
      check('one point per litter, numbered in order', lits.length === seen.length && lits.every((p, i) => p.litter === i + 1));
      check('each litter\'s point matches diversity right after it',
        lits.every((p, i) => Math.abs(p.value - seen[i]) < 1e-12), lits.map((p, i) => p.value.toFixed(4) + '/' + seen[i].toFixed(4)).join(' '));
      check('ends with now, after the last retirement', h[h.length - 1].kind === 'now' && h[h.length - 1].value === f.diversity());
      check('each point lists its breeding sheep', h.every(p => p.ids.length === p.breeders) &&
        h[h.length - 1].ids.slice().sort().join() === f.list().filter(r => f.breedingsLeft(r.id) > 0).map(r => r.id).sort().join());
      check('each litter knows its parents and inbreeding',
        lits.every(p => f.get(p.sire).sex === 'ram' && f.get(p.dam).sex === 'ewe' && p.inbreeding === f.offspringInbreeding(p.sire, p.dam)));

      // A save from before litters and retirements were timed still gives a history.
      const old = JSON.parse(JSON.stringify(f.exportState()));
      for (const r of old.sheep) { delete r.retiredAt; for (const l of r.litters) delete l.at; }
      const g = E.createFlock({});
      g.importState(old);
      const gh = g.diversityHistory();
      check('older saves: same points, every value a number',
        gh.length === h.length && gh.every(p => typeof p.value === 'number' && p.value > 0 && p.value <= 1));
      check('older saves: the start and now are exact', gh[0].value === h[0].value && gh[gh.length - 1].value === h[h.length - 1].value);

      f.undoLastBreeding();
      check('undo drops the litter from the history', f.diversityHistory().filter(p => p.kind === 'litter').length === seen.length - 1);
      const lone = E.createFlock({ rng: E.mulberry32(22) });
      lone.addSheep({ sex: 'ram' });
      lone.addSheep({ sex: 'ewe' });
      const lh = lone.diversityHistory();
      check('no litters yet: just the start and now', lh.length === 2 && lh[0].kind === 'start' && lh[1].kind === 'now');
      const [loneRam, loneEwe] = lone.list();
      lone.breed(loneRam.id, loneEwe.id);
      const late = lone.addSheep({ sex: 'ewe' });
      lone.breed(loneRam.id, late.id);
      const [l1, l2] = lone.diversityHistory().filter(p => p.kind === 'litter');
      check('a litter\'s time comes after its lambs\' births', [l1, l2].every(p => p.lambs.every(id => lone.get(id).born <= p.at)));
      check('a founder added between litters falls between their times', l1.at < late.born && late.born <= l2.at, l1.at + ' < ' + late.born + ' <= ' + l2.at);

      // Real times, from the clock the flock is given.
      let tick = 1000;
      const timed = E.createFlock({ rng: E.mulberry32(23), now: () => (tick += 10) });
      const tRam = timed.addSheep({ sex: 'ram' });
      const tEwe = timed.addSheep({ sex: 'ewe' });
      const tLambs = timed.breed(tRam.id, tEwe.id).lambs;
      timed.retire(tEwe.id);
      check('births note the real time', tRam.bornTime === 1010 && tEwe.bornTime === 1020 && tLambs.every(l => l.bornTime > 1020));
      check('litters note it on both parents', tRam.litters[0].time > 1020 && tRam.litters[0].time === tEwe.litters[0].time);
      check('retiring notes it', tEwe.retiredTime > tRam.litters[0].time);
      const tBack = E.createFlock({});
      tBack.importState(JSON.parse(JSON.stringify(timed.exportState())));
      check('real times survive saving', tBack.get(tEwe.id).retiredTime === tEwe.retiredTime && tBack.get(tRam.id).litters[0].time === tRam.litters[0].time);
      timed.unretire(tEwe.id);
      check('returning to breeding clears the retired time', tEwe.retiredTime === undefined);
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
      check('colored lamb from Aw/Aw ram: blames the ram\'s Agouti, for its pattern', white.length === 1 &&
        white[0].trait === 'pattern' && white[0].genes[0].gene === 'agouti' && white[0].genes[0].culprit === 'sire', JSON.stringify(white));
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
      check('each lamb allele comes from the matching parent', E.BASE_GENES.every(g =>
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
    heading('Breeding limits');
    {
      const f = E.createFlock({ rng: E.mulberry32(5) });
      const ram = f.addSheep({ sex: 'ram' });
      const ewe = f.addSheep({ sex: 'ewe' });
      check('rams can be bred more often than ewes', E.BREEDING_LIMIT.ram > E.BREEDING_LIMIT.ewe,
        'ram ' + E.BREEDING_LIMIT.ram + ', ewe ' + E.BREEDING_LIMIT.ewe);
      check('a new ewe has every breeding left', f.breedingsLeft(ewe.id) === E.BREEDING_LIMIT.ewe);
      for (let i = 0; i < E.BREEDING_LIMIT.ewe; i++) f.breed(ram.id, ewe.id);
      check('each breeding uses one up', f.breedingsLeft(ewe.id) === 0 &&
        f.breedingsLeft(ram.id) === E.BREEDING_LIMIT.ram - E.BREEDING_LIMIT.ewe);
      let refused = false;
      const before = f.list().length;
      try { f.breed(ram.id, ewe.id); } catch (e) { refused = true; }
      check('a used-up ewe cannot be bred again', refused && f.list().length === before);
      f.undoLastBreeding();
      check('undo gives the breeding back', f.breedingsLeft(ewe.id) === 1);
      const ram2 = f.addSheep({ sex: 'ram' });
      for (let i = 0; i < E.BREEDING_LIMIT.ram; i++) f.breed(ram2.id, f.addSheep({ sex: 'ewe' }).id);
      refused = false;
      try { f.breed(ram2.id, f.addSheep({ sex: 'ewe' }).id); } catch (e) { refused = true; }
      check('a used-up ram cannot be bred again', refused && f.breedingsLeft(ram2.id) === 0);
    }

    // ------------------------------------------------------------------
    heading('Breeding goals');
    {
      const L = (color, pattern, extra) => Object.assign({ sex: 'ewe', color, pattern, spotted: false, horned: false }, extra);
      check('b/b does not meet a b/b goal on B/b', !E.meetsGoal(['normal', 'brown'], ['brown', 'brown']) && E.meetsGoal(['brown', 'brown'], ['brown', 'brown']));
      check('"Abf / any" is met by Abf/Aa in either order', E.meetsGoal(['solid', 'badgerface'], ['badgerface', null]));
      const bb = { brown: ['brown', 'brown'] };
      check('goal b/b: a black sheep can\'t have it', E.goalStatus(L('black', 'solid'), guess(), bb).status === 'no');
      check('goal b/b: a moorit sheep has it for sure', E.goalStatus(L('brown', 'solid'), guess(), bb).status === 'yes');
      check('goal b/b: a white sheep might', E.goalStatus(L('white', 'none'), guess(), bb).status === 'maybe');
      check('goal b/b: a white sheep noted B/? can\'t', E.goalStatus(L('white', 'none'), guess({ brown: ['normal', '?'] }), bb).status === 'no');
      const both = E.goalStatus(L('black', 'solid'), guess(), { agouti: ['badgerface', 'badgerface'], extension: ['normal', 'normal'] });
      check('a solid sheep can\'t be Abf/Abf and E+/E+ at once, though each alone is possible', both.status === 'no' && !both.together &&
        both.genes.agouti === 'maybe' && both.genes.extension === 'maybe', JSON.stringify(both));
      check('a badgerface sheep is E+/E+ for sure', E.goalStatus(L('black', 'badgerface'), guess(), { extension: ['normal', 'normal'] }).status === 'yes');
      check('an empty goal gives no status', E.goalStatus(L('black', 'solid'), guess(), { brown: [null, null] }) === null);
      const carriers = guess({ brown: ['normal', 'brown'], spotting: ['normal', 'spotted'] });
      const p = E.predictGoal(carriers, carriers, { brown: ['brown', 'brown'], spotting: ['spotted', 'spotted'] });
      check('B/b S/s x B/b S/s: 6.25% of lambs are b/b s/s', p.ewe.min === 0.0625 && p.ewe.max === 0.0625 && p.ram.min === 0.0625, JSON.stringify(p.ewe));
      const q = E.predictGoal(guess({ brown: ['brown', '?'] }), guess({ brown: ['brown', 'brown'] }), bb);
      check('b/? x b/b: 50-100% b/b, hinging on the ram', q.ewe.min === 0.5 && q.ewe.max === 1 && q.ewe.depends.some(d => d.parent === 'sire'), JSON.stringify(q.ewe));
      const all = E.blankGuess(E.GENES);
      const big = {};
      for (const g of E.GENES) big[g.key] = [g.alleles[0].id, null];
      const t0 = Date.now();
      for (let i = 0; i < 20; i++) { E.predictGoal(all, all, big); E.goalStatus(L('black', 'solid', { shade: 'full', glow: false, speckled: false }), all, big); }
      check('goal checks on every gene stay quick: ' + ((Date.now() - t0) / 20).toFixed(1) + ' ms', (Date.now() - t0) / 20 < 50);
    }

    // ------------------------------------------------------------------
    heading('Flock size limit');
    {
      check('the game\'s limit is a positive number', E.MAX_FLOCK_SIZE > 8, 'MAX_FLOCK_SIZE = ' + E.MAX_FLOCK_SIZE);
      check('flocks have no limit unless given one', E.createFlock({}).room() === Infinity);
      const f = E.createFlock({ rng: E.mulberry32(6), maxSize: 4 });
      const ram = f.addSheep({ sex: 'ram' });
      const ewe = f.addSheep({ sex: 'ewe' });
      f.addSheep({ sex: 'ewe' });
      check('room counts down as sheep join', f.room() === 1);
      f.breed(ram.id, ewe.id);
      check('a litter can take a nearly full flock a little over', f.room() <= 0 && f.room() >= -2, 'room ' + f.room());
      let refused = false;
      try { f.breed(ram.id, ewe.id); } catch (e) { refused = /full/.test(e.message); }
      check('a full flock can\'t breed', refused);
      for (const r of f.list()) if (r.id !== ram.id && r.id !== ewe.id) f.retire(r.id);
      check('sheep retired early don\'t count', f.room() === 2);
      check('after retiring some, breeding works again', f.breed(ram.id, ewe.id).event !== undefined);
      const g = E.createFlock({ rng: E.mulberry32(7), maxSize: 100 });
      const r2 = g.addSheep({ sex: 'ram' });
      const e2 = g.addSheep({ sex: 'ewe' });
      for (let i = 0; i < E.BREEDING_LIMIT.ewe; i++) g.breed(r2.id, e2.id);
      check('retired sheep take no space', g.room() === 100 - (g.list().length - 1), 'room ' + g.room() + ' with ' + g.list().length + ' sheep');

      const h = E.createFlock({ rng: E.mulberry32(8), maxSize: 3 });
      const ram3 = h.addSheep({ sex: 'ram' });
      const ewe3 = h.addSheep({ sex: 'ewe' });
      const spare = h.addSheep({ sex: 'ewe' });
      h.retire(spare.id);
      check('a sheep retired early can\'t breed', h.breedingsLeft(spare.id) === 0);
      check('a sheep retired early takes no space', h.room() === 1);
      let threw = false;
      try { h.breed(ram3.id, spare.id); } catch (e) { threw = true; }
      check('breeding a sheep retired early is refused', threw);
      h.addSheep({ sex: 'ram' });
      threw = false;
      try { h.unretire(spare.id); } catch (e) { threw = /full/.test(e.message); }
      check('a full flock can\'t take a sheep back to breeding', threw && h.get(spare.id).retired === true);
      h.retire(ewe3.id);
      h.unretire(spare.id);
      check('with room, a sheep returns to breeding', !h.get(spare.id).retired && h.breedingsLeft(spare.id) === E.BREEDING_LIMIT.ewe);
      check('retired sheep stay in the records', h.list().length === 4 && !!h.get(ewe3.id));
      const saved = JSON.parse(JSON.stringify(h.exportState()));
      const back = E.createFlock({ maxSize: 3 });
      back.importState(JSON.parse(JSON.stringify(saved)));
      check('early retirement is saved', back.get(ewe3.id).retired === true && back.room() === h.room());
      // Saves from when sheep could be removed from the flock: removed ones load as retired.
      const old = JSON.parse(JSON.stringify(saved));
      const oldEwe = old.sheep.find(r => r.id === ewe3.id);
      delete oldEwe.retired;
      oldEwe.removed = true;
      for (const r of old.sheep) if (r.id !== ewe3.id) r.removed = false;
      const migrated = E.createFlock({ maxSize: 3 });
      migrated.importState(old);
      check('a removed sheep in an older save loads as retired', migrated.get(ewe3.id).retired === true &&
        migrated.list().every(r => !('removed' in r)) && migrated.room() === h.room());
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

    // ------------------------------------------------------------------
    heading('Factored color predictions');
    {
      // The old way: try every "?" across all four color genes at once.
      const COLOR4 = ['agouti', 'extension', 'brown', 'spotting'];
      const brute = (s, d) => E.predictOutcomes(s, d, COLOR4, g => ({ key: E.colorKey(E.colorOf(g)), value: null }));
      const r = E.mulberry32(2024);
      const randomGuess = () => {
        const g = E.blankGuess();
        g.ruledOut = {};
        for (const k of COLOR4) {
          const ids = E.alleleIds(k);
          g[k] = [0, 1].map(() => (r() < 0.45 ? '?' : ids[Math.floor(r() * ids.length)]));
          g.ruledOut[k] = r() < 0.25 ? ids.filter(a => !g[k].includes(a) && r() < 0.5) : [];
        }
        return g;
      };
      const N = 400;
      let worst = 0;
      let mismatch = null;
      for (let i = 0; i < N && !mismatch; i++) {
        const s = randomGuess();
        const d = randomGuess();
        const old = brute(s, d);
        const now = E.predictOffspring(s, d).colors;
        if (old.length !== now.length) mismatch = 'pair ' + i + ': ' + old.length + ' looks before, ' + now.length + ' now';
        for (const o of old) {
          const n = now.find(x => x.key === o.key);
          if (!n) { mismatch = 'pair ' + i + ': missing ' + o.key; break; }
          worst = Math.max(worst, Math.abs(n.min - o.min), Math.abs(n.max - o.max));
        }
      }
      check('same looks and ranges as before on ' + N + ' random pairs of base guesses', !mismatch && worst < 2e-4,
        mismatch || 'largest difference ' + worst);
      const p = E.predictOffspring(E.blankGuess(), E.blankGuess());
      check('base guesses predict no fantasy genes', !p.opal && !p.speckle && !p.glow && !p.colorParts.shade);
    }

    // ------------------------------------------------------------------
    heading('Fantasy genes: looks');
    const fbase = {
      dilution: ['full', 'full'], hue: ['normal', 'normal'], opal: ['plain', 'plain'],
      speckle: ['normal', 'normal'], lantern: ['plain', 'plain'],
    };
    const fgeno = (over, sex) => {
      const g = Object.assign({}, base, fbase, over);
      if (sex === 'ram' && !(over && over.opal)) g.opal = [null, 'plain'];
      return g;
    };
    const flook = (over, sex) => E.phenotypeOf(fgeno(over, sex), sex || 'ewe');
    const fguess = over => Object.assign(E.blankGuess(E.GENES), over);
    {
      check('D/D full, D/d dusk, d/d frost', flook({}).shade === 'full' &&
        flook({ dilution: ['full', 'dilute'] }).shade === 'dusk' && flook({ dilution: ['dilute', 'dilute'] }).shade === 'frost');
      check('hue hides brown: Hur/Hur on a b/b sheep is rose', flook({ hue: ['rose', 'rose'], brown: ['brown', 'brown'] }).color === 'rose');
      check('Hur/Hub is violet; one hue allele shows nothing',
        flook({ hue: ['rose', 'blue'] }).color === 'violet' && flook({ hue: ['blue', 'normal'] }).color === 'black');
      const white = flook({ agouti: ['white', 'solid'], hue: ['blue', 'blue'], dilution: ['dilute', 'dilute'] });
      check('white hides hue and dilution', white.color === 'white' && white.shade === 'full');
      const surface = flook({ agouti: ['white', 'white'], opal: ['opal', 'opal'], speckle: ['speckled', 'speckled'], lantern: ['glow', 'plain'] });
      check('white still shows opal, speckles and glow', surface.opal === 'full' && surface.speckled && surface.glow);
      check('opal: a ram with one opal X is opal, a ewe with one is patchy',
        flook({ opal: [null, 'opal'] }, 'ram').opal === 'full' && flook({ opal: ['opal', 'plain'] }).opal === 'patchy');
      check('a base genotype has no fantasy fields', !['shade', 'opal', 'speckled', 'glow'].some(k => k in look({})));
      const f = E.createFlock({ rng: E.mulberry32(8) });
      check('a base flock\'s sheep have base genes only', !('opal' in f.addSheep({}).phenotype) && f.activeGenes().length === E.BASE_GENES.length);
    }

    // ------------------------------------------------------------------
    heading('Fantasy genes: ratios (20,000 lambs each)');
    function fratio(sireOver, damOver, predicate, sex) {
      const s = fgeno(sireOver, 'ram');
      const d = fgeno(damOver);
      let hit = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) {
        const g = E.inheritGenotype(rng, s, d, sex || 'ewe');
        if (predicate(E.phenotypeOf(g, sex || 'ewe'), g)) hit++;
      }
      return hit / n;
    }
    {
      const Dd = { dilution: ['full', 'dilute'] };
      near('D/d x D/d -> dusk ≈ 50%', fratio(Dd, Dd, l => l.shade === 'dusk'), 0.5, 0.015);
      near('D/d x D/d -> frost ≈ 25%', fratio(Dd, Dd, l => l.shade === 'frost'), 0.25, 0.015);
      const violet = { hue: ['rose', 'blue'] };
      near('violet x violet -> rose ≈ 25%', fratio(violet, violet, l => l.color === 'rose'), 0.25, 0.015);
      near('violet x violet -> violet ≈ 50%', fratio(violet, violet, l => l.color === 'violet'), 0.5, 0.015);
      near('violet x violet -> blue ≈ 25%', fratio(violet, violet, l => l.color === 'blue'), 0.25, 0.015);
      const p = E.predictOffspring(fguess(Object.assign({}, known, { agouti: ['solid', 'solid'], dilution: ['full', 'dilute'], hue: ['rose', 'blue'] })),
        fguess(Object.assign({}, known, { agouti: ['solid', 'solid'], dilution: ['full', 'dilute'], hue: ['rose', 'blue'] })));
      const at = (color, shade) => (p.colors.find(o => o.value.color === color && o.value.shade === shade) || {}).min;
      check('predicted: dusk violet 25%, frost rose 6.25%', at('violet', 'dusk') === 0.25 && at('rose', 'frost') === 0.0625,
        p.colors.map(o => E.colorKey(o.value) + ' ' + pct(o.min)).join('; '));
    }

    // ------------------------------------------------------------------
    heading('Opal (X-linked, dev only)');
    {
      const plainFantasy = E.createFlock({ rng: E.mulberry32(30), fantasy: true, debug: true });
      const someone = plainFantasy.addSheep({ sex: 'ram' });
      check('fantasy flocks leave opal out unless asked', !plainFantasy.activeGenes().some(g => g.key === 'opal') &&
        !('opal' in someone.phenotype) && !('opal' in plainFantasy.peekGenotype(someone.id)));
      check('dev genes need fantasy genes too', !E.createFlock({ devGenes: ['opal'] }).activeGenes().some(g => g.key === 'opal'));
      const f = E.createFlock({ rng: E.mulberry32(31), fantasy: true, devGenes: ['opal'], debug: true });
      check('devGenes: [\'opal\'] adds it', f.activeGenes().some(g => g.key === 'opal'));
      let rams = 0;
      let ewes = 0;
      let ramOk = true;
      let eweOk = true;
      for (let i = 0; i < 300; i++) {
        const ram = f.addSheep({ sex: 'ram', genotype: fgeno({ opal: [null, 'opal'] }, 'ram') });
        const ewe = f.addSheep({ sex: 'ewe', genotype: fgeno({ opal: ['plain', 'plain'] }) });
        for (const l of f.breed(ram.id, ewe.id).lambs) {
          const g = f.peekGenotype(l.id).opal;
          if (l.sex === 'ram') { rams++; if (g[0] !== null || g[1] !== 'plain') ramOk = false; }
          else { ewes++; if (g[0] !== 'opal' || g[1] !== 'plain') eweOk = false; }
        }
      }
      check('opal ram x plain ewe: ' + rams + ' ram lambs, all with only their dam\'s plain X', ramOk && rams > 100);
      check('opal ram x plain ewe: ' + ewes + ' ewe lambs, all carrying their sire\'s opal X', eweOk && ewes > 100);
      const founderRam = f.addSheep({ sex: 'ram' });
      check('founder rams store [null, X]', f.peekGenotype(founderRam.id).opal[0] === null);
      const p = E.predictOffspring(fguess({ opal: [null, 'opal'] }), fguess({ opal: ['opal', 'plain'] }));
      const share = (sex, key) => (p.opal[sex].find(o => o.key === key) || { min: 0 }).min;
      check('opal ram x patchy ewe: ram lambs 50% opal, ewe lambs 50% full and 50% patchy',
        share('ram', 'full') === 0.5 && share('ram', 'none') === 0.5 && share('ewe', 'full') === 0.5 && share('ewe', 'patchy') === 0.5,
        JSON.stringify(p.opal));
      const q = E.predictOffspring(fguess({ opal: [null, '?'] }), fguess({ opal: ['plain', 'plain'] }));
      check('plain ewe: ram lambs never opal, whatever the ram', q.opal.ram.every(o => o.key === 'none'));
      const opalSon = { sex: 'ram', color: 'white', pattern: 'none', spotted: false, horned: false, opal: 'full' };
      const issue = E.checkLamb(opalSon, fguess({ opal: [null, 'opal'] }), fguess({ opal: ['plain', 'plain'] }));
      check('opal ram lamb from a plain ewe: blames only the ewe', issue.length === 1 && issue[0].trait === 'opal' &&
        issue[0].genes[0].culprit === 'dam', JSON.stringify(issue));
      const self = E.checkSelf({ sex: 'ewe', color: 'white', pattern: 'none', spotted: false, horned: false, opal: 'patchy' },
        fguess({ opal: ['opal', 'opal'] }));
      check('patchy ewe guessed XO/XO: own guess flagged', self.length === 1 && self[0].trait === 'opal');
    }

    // ------------------------------------------------------------------
    heading('Speckle (mutation)');
    {
      const s = fgeno({});
      const n = 40000;
      let mutated = 0;
      for (let i = 0; i < n; i++) {
        const g = E.inheritGenotype(rng, s, s, 'ewe');
        mutated += (g.speckle[0] === 'speckled') + (g.speckle[1] === 'speckled');
      }
      near('St/St x St/St: mutation rate per gamete', mutated / (2 * n), E.SPECKLE_MUTATION_RATE, 0.001);
      const speckled = { sex: 'ewe', color: 'black', pattern: 'solid', spotted: false, horned: false, speckled: true };
      const one = E.checkLamb(speckled, fguess({ speckle: ['speckled', 'speckled'] }), fguess({ speckle: ['normal', 'normal'] }));
      check('speckled lamb from st/st x St/St: rare, could be a new mutation', one.length === 1 && one[0].rare && one[0].trait === 'speckle',
        JSON.stringify(one));
      const two = E.checkLamb(speckled, fguess({ speckle: ['normal', 'normal'] }), fguess({ speckle: ['normal', 'normal'] }));
      check('speckled lamb from St/St x St/St: a real surprise', two.length === 1 && !two[0].rare && two[0].genes[0].culprit === 'both',
        JSON.stringify(two));
      const p = E.predictOffspring(fguess({ speckle: ['normal', 'speckled'] }), fguess({ speckle: ['normal', 'speckled'] }));
      check('St/st x St/st: 25% speckled', p.speckle.min === 0.25 && p.speckle.max === 0.25);
    }

    // ------------------------------------------------------------------
    heading('Lantern (lethal)');
    {
      const f = E.createFlock({ rng: E.mulberry32(41), fantasy: true, debug: true });
      let LL = false;
      for (let i = 0; i < 3000; i++) {
        const g = f.peekGenotype(f.addSheep({}).id).lantern;
        if (g[0] === 'glow' && g[1] === 'glow') LL = true;
      }
      check('3000 founders, none L/L', !LL);
      let born = 0;
      let glowing = 0;
      let lost = 0;
      let empty = 0;
      let recorded = true;
      const Lp = { lantern: ['glow', 'plain'] };
      for (let i = 0; i < 2000; i++) {
        const ram = f.addSheep({ sex: 'ram', genotype: fgeno(Lp, 'ram') });
        const ewe = f.addSheep({ sex: 'ewe', genotype: fgeno(Lp) });
        const res = f.breed(ram.id, ewe.id);
        lost += res.lost;
        if (!res.lambs.length) empty++;
        if ((ewe.litters[0].lost || 0) !== res.lost || (res.event.lost || 0) !== res.lost) recorded = false;
        for (const l of res.lambs) {
          born++;
          if (l.phenotype.glow) glowing++;
          const g = f.peekGenotype(l.id).lantern;
          if (g[0] === 'glow' && g[1] === 'glow') LL = true;
        }
      }
      check('no living lamb is L/L', !LL);
      near('L/+ x L/+: glowing among born lambs ≈ 2/3', glowing / born, 2 / 3, 0.02);
      near('L/+ x L/+: lambs lost ≈ 25%', lost / (born + lost), 0.25, 0.02);
      check('losses are stored on the litter; ' + empty + ' litters were empty', recorded && empty > 0);
      const p = E.predictOffspring(fguess(Lp), fguess(Lp));
      check('predicted: glowing 50%, plain 25%, not born 25%', p.glow.map(o => o.key + ' ' + o.min).join() === 'glow 0.5,plain 0.25,lost 0.25',
        JSON.stringify(p.glow));
      const q = E.predictOffspring(fguess({ lantern: ['glow', '?'] }), fguess({ lantern: ['?', 'glow'] }));
      check('L/? x ?/L: a living parent isn\'t L/L, so it\'s 50% / 25% / 25% exactly', q.glow.map(o => o.key + ' ' + o.min + '-' + o.max).join() ===
        'glow 0.5-0.5,plain 0.25-0.25,lost 0.25-0.25', JSON.stringify(q.glow));
      const self = E.checkSelf({ sex: 'ewe', color: 'white', pattern: 'none', spotted: false, horned: false, glow: true }, fguess({ lantern: ['glow', 'glow'] }));
      check('a guess of L/L on a living sheep is flagged', self.length === 1 && self[0].trait === 'glow');
    }

    // ------------------------------------------------------------------
    heading('Gilded (threshold)');
    {
      const f = E.createFlock({ rng: E.mulberry32(51), fantasy: true, debug: true });
      const N = 6000;
      for (let i = 0; i < N; i++) f.addSheep({});
      const founders = f.list();
      near('founders gilded ≈ 16%', founders.filter(r => r.phenotype.gilded).length / N, 1 - E.normCdf(1), 0.015);
      check('the hidden score never shows on the record', !/gild"?\s*:\s*-?\d/.test(JSON.stringify(founders[0])));
      // Each call uses fresh sheep, so nobody runs out of breedings.
      const used = new Set();
      const lambRate = (ramGilded, eweGilded) => {
        const pick = (sex, gilded) => founders.filter(r => r.sex === sex && r.phenotype.gilded === gilded && !used.has(r.id)).slice(0, 300);
        const rams = pick('ram', ramGilded);
        const ewes = pick('ewe', eweGilded);
        for (const r of rams.concat(ewes)) used.add(r.id);
        let n = 0;
        let g = 0;
        let predicted = 0;
        for (let i = 0; i < Math.min(rams.length, ewes.length); i++) {
          predicted += f.predictGilded(rams[i].id, ewes[i].id);
          for (let k = 0; k < E.BREEDING_LIMIT.ewe; k++) {
            for (const l of f.breed(rams[i].id, ewes[i].id).lambs) { n++; if (l.phenotype.gilded) g++; }
          }
        }
        return { rate: g / n, predicted: predicted / Math.min(rams.length, ewes.length) };
      };
      const both = lambRate(true, true);
      const one = lambRate(true, false);
      const none = lambRate(false, false);
      check('lamb rate rises with parent status: ' + [none, one, both].map(x => pct(x.rate)).join(' < '),
        none.rate < one.rate && one.rate < both.rate);
      near('gilded x gilded: predicted chance close to what happens', both.predicted, both.rate, 0.05);
      near('plain x plain: predicted chance close to what happens', none.predicted, none.rate, 0.05);
      check('no gilded prediction without fantasy genes', E.createFlock({}).predictGilded('s1', 's2') === null);
    }

    // ------------------------------------------------------------------
    heading('Fantasy surprises name the part of the look');
    {
      const dusk = { sex: 'ewe', color: 'black', pattern: 'solid', spotted: false, shade: 'dusk', horned: false };
      const a = E.checkLamb(dusk, fguess({ dilution: ['full', 'full'] }), fguess({ dilution: ['full', 'full'] }));
      check('dusk lamb from D/D x D/D: a shade issue, one parent is wrong', a.length === 1 && a[0].trait === 'shade' && a[0].genes[0].culprit === 'either',
        JSON.stringify(a));
      const frost = Object.assign({}, dusk, { shade: 'frost' });
      const a2 = E.checkLamb(frost, fguess({ dilution: ['full', 'full'] }), fguess({ dilution: ['full', 'full'] }));
      check('frost lamb from D/D x D/D: both parents are wrong', a2.length === 1 && a2[0].genes[0].culprit === 'both', JSON.stringify(a2));
      const violet = { sex: 'ewe', color: 'violet', pattern: 'solid', spotted: false, shade: 'full', horned: false };
      const b = E.checkLamb(violet, fguess({ hue: ['normal', 'normal'] }), fguess({ hue: ['rose', 'blue'] }));
      check('violet lamb from a Hu+/Hu+ ram: a dark color issue on the ram\'s Hue', b.length === 1 && b[0].trait === 'dark color' &&
        b[0].genes.length === 1 && b[0].genes[0].gene === 'hue' && b[0].genes[0].culprit === 'sire', JSON.stringify(b));
      const white = { sex: 'ewe', color: 'white', pattern: 'none', spotted: false, shade: 'full', horned: false };
      check('a white lamb ignores hue and dilution guesses', E.checkLamb(white,
        fguess({ agouti: ['white', 'solid'], hue: ['rose', 'rose'] }), fguess({ hue: ['rose', 'rose'], dilution: ['dilute', 'dilute'] })).length === 0);
    }

    // ------------------------------------------------------------------
    heading('Speed');
    {
      const all = E.blankGuess(E.GENES);
      const mixed = () => {
        const g = E.blankGuess(E.GENES);
        for (const gene of E.GENES) g[gene.key] = ['?', gene.alleles[gene.alleles.length - 1].id];
        return g;
      };
      let slowest = 0;
      for (const [s, d] of [[all, all], [mixed(), mixed()], [all, mixed()]]) {
        const t0 = Date.now();
        for (let i = 0; i < 10; i++) E.predictOffspring(s, d);
        slowest = Math.max(slowest, (Date.now() - t0) / 10);
      }
      check('predictOffspring on every gene with "?" slots: ' + slowest.toFixed(1) + ' ms', slowest < 50);
    }

    // ------------------------------------------------------------------
    heading('Saving v1 and v2 flocks');
    {
      const f = E.createFlock({ rng: E.mulberry32(61), fantasy: true, debug: true });
      const ram = f.addSheep({ sex: 'ram' });
      const ewe = f.addSheep({ sex: 'ewe' });
      f.breed(ram.id, ewe.id);
      const state = JSON.parse(JSON.stringify(f.exportState()));
      check('a v2 save says it has fantasy genes', state.v === 2 && state.fantasy === true);
      check('the hidden part is still encoded', !/opal|lantern|gild|dilution/.test(state.secret));
      const g = E.createFlock({ debug: true });
      g.importState(state);
      check('loading restores fantasy genes and hidden scores', g.fantasy &&
        JSON.stringify(g.peekGenotype(ram.id)) === JSON.stringify(f.peekGenotype(ram.id)) &&
        g.peekValues(ewe.id).gild === f.peekValues(ewe.id).gild && g.activeGenes().length === E.GENES.length - 1);
      const d = E.createFlock({ rng: E.mulberry32(63), fantasy: true, devGenes: ['opal'], debug: true });
      d.addSheep({});
      const dState = JSON.parse(JSON.stringify(d.exportState()));
      const d2 = E.createFlock({ debug: true });
      d2.importState(dState);
      check('a flock made with opal keeps it after loading', d2.activeGenes().some(x => x.key === 'opal'));
      delete dState.devGenes;
      const d3 = E.createFlock({ debug: true });
      d3.importState(dState);
      check('older saves with opal genotypes keep opal too', d3.activeGenes().some(x => x.key === 'opal'));
      const b = E.createFlock({ rng: E.mulberry32(62), debug: true });
      const only = b.addSheep({});
      check('a base flock saves as v2 without fantasy', b.exportState().v === 2 && b.exportState().fantasy === false);
      const v1 = JSON.parse(JSON.stringify(b.exportState()));
      v1.v = 1;
      delete v1.fantasy;
      const h = E.createFlock({ fantasy: true, debug: true });
      h.importState(v1);
      check('a v1 save loads as a flock without fantasy genes', !h.fantasy && h.activeGenes().length === E.BASE_GENES.length &&
        !('opal' in h.peekGenotype(only.id)));
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
