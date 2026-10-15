/* Sheep Genetics Sandbox: display helper.
 *
 * Phenotype in, swatch and labels out. This is the only code that draws a
 * sheep, and it never sees a genotype. A phenotype ("look") is
 *   { sex, color: white|black|brown|rose|blue|violet,
 *     pattern: none|solid|badgerface|mouflon|mixed, spotted, horned }
 * plus, in flocks with fantasy genes,
 *   { shade: full|dusk|frost, opal: none|patchy|full, speckled, gilded, glow }
 * Missing fantasy fields mean the plain version.
 */
(function (root) {
  'use strict';

  const WHITE = '#f4f0e6';
  // Each dark color at full, dusk and frost shade, plus the light part of
  // badgerface and mouflon patterns, which dilution leaves alone.
  const PIGMENT = {
    black: { full: '#2a2522', dusk: '#5c544e', frost: '#968e88', light: '#d3bf9c' },
    brown: { full: '#6c4128', dusk: '#956a4d', frost: '#c09d81', light: '#e3cdb0' },
    rose: { full: '#8a3353', dusk: '#b46483', frost: '#d99ab2', light: '#f1dae0' },
    blue: { full: '#2b4677', dusk: '#5a78a9', frost: '#95aed4', light: '#dbe3ef' },
    violet: { full: '#55337a', dusk: '#8163a8', frost: '#b49dd1', light: '#e5dcef' },
  };
  // Opal: a faint pastel sheen over the whole coat, or in soft blobs over
  // about half of it when patchy.
  const OPAL = ['rgba(255, 168, 214, A)', 'rgba(160, 212, 255, A)', 'rgba(176, 255, 214, A)', 'rgba(255, 234, 150, A)'];
  const opalTint = (i, a) => OPAL[i].replace('A', a);
  const blob = (x, y, r, i) => 'radial-gradient(' + r + '% ' + r + '% at ' + x + '% ' + y + '%, ' +
    opalTint(i, 0.55) + ' 55%, ' + opalTint(i, 0) + ' 100%)';
  const OPAL_LAYER = {
    full: 'conic-gradient(from 200deg, ' + [0, 1, 2, 3, 0].map(i => opalTint(i, 0.36)).join(', ') + ')',
    patchy: [blob(30, 34, 34, 0), blob(70, 64, 32, 1), blob(30, 78, 22, 2)].join(', '),
  };
  // Speckles: tiny gold dots in fixed places, clear of the spotting patch.
  const SPECKS = [[28, 30], [19, 55], [38, 77], [61, 79], [79, 63], [43, 50]];
  const SPECK_LAYERS = SPECKS.map(([x, y]) =>
    'radial-gradient(6% 6% at ' + x + '% ' + y + '%, #f1c232 50%, #8f6508 68%, transparent 76%)').join(', ');

  // Horns: curled for rams, short and swept back for ewes. Paths are in swatch
  // units (the circle spans 0 to 100) and may reach past its edge. Each horn is
  // drawn twice, a dark edge under a light fill; the right one is the left mirrored.
  const HORN_PATH = {
    ram: 'M33 6 C 20 -5, 0 -2, -9 17 C -16 33, -4 50, 8 43 C 17 38, 13 25, 3 28',
    ewe: 'M36 6 C 31 -6, 18 -12, 7 -4',
  };

  function hornsSVG(sex) {
    const kind = sex === 'ram' ? 'ram' : 'ewe';
    const one = '<path class="horn-edge" d="' + HORN_PATH[kind] + '"/><path class="horn-fill" d="' + HORN_PATH[kind] + '"/>';
    return '<svg class="horns horns-' + kind + '" viewBox="-20 -20 140 140" aria-hidden="true">' + one +
      '<g transform="matrix(-1 0 0 1 100 0)">' + one + '</g></svg>';
  }

  const COLOR_NAME = { white: 'White', black: 'Black', brown: 'Moorit', rose: 'Rose', blue: 'Blue', violet: 'Violet' };
  const SHADE_NAME = { full: 'Full', dusk: 'Dusk', frost: 'Frost' };
  const PATTERN_NAME = {
    none: '', solid: 'solid', badgerface: 'badgerface', mouflon: 'mouflon', mixed: 'badgerface/mouflon',
  };
  const OPAL_NAME = { none: 'None', patchy: 'Patchy opal', full: 'Opal' };
  const TEXT = '︎'; // keep ♂ ♀ as text glyphs, not emoji
  const SEX_ICON = { ram: '♂' + TEXT, ewe: '♀' + TEXT };
  const cap = s => s[0].toUpperCase() + s.slice(1);

  function halves(top, bottom) {
    return 'linear-gradient(to bottom, ' + top + ' 0 50%, ' + bottom + ' 50% 100%)';
  }

  function coat(look) {
    if (look.color === 'white') return WHITE;
    const p = PIGMENT[look.color];
    const dark = p[look.shade || 'full'];
    switch (look.pattern) {
      case 'badgerface': return halves(p.light, dark);
      case 'mouflon': return halves(dark, p.light);
      case 'mixed':
        return halves(p.light, dark) + ' left / 50% 100% no-repeat, ' +
               halves(dark, p.light) + ' right / 50% 100% no-repeat';
      default: return dark;
    }
  }

  /** CSS background for a look: surface effects layered over the coat. */
  function background(look) {
    const layers = [];
    if (look.speckled) layers.push(SPECK_LAYERS);
    if (OPAL_LAYER[look.opal]) layers.push(OPAL_LAYER[look.opal]);
    layers.push(coat(look));
    return layers.join(', ');
  }

  // The words after the main color, in reading order.
  function extras(look) {
    const out = [];
    if (look.spotted && look.color !== 'white') out.push('spotted');
    if (look.opal === 'full') out.push('opal');
    else if (look.opal === 'patchy') out.push('patchy opal');
    if (look.speckled) out.push('speckled');
    if (look.gilded) out.push('gilded');
    if (look.glow) out.push('glowing');
    return out;
  }

  /** e.g. "Moorit solid, spotted" or "Frost violet badgerface, opal, glowing". */
  function title(look) {
    let head = 'White';
    if (look.color !== 'white') {
      const shade = look.shade && look.shade !== 'full' ? SHADE_NAME[look.shade] + ' ' : '';
      head = (shade ? shade + COLOR_NAME[look.color].toLowerCase() : COLOR_NAME[look.color]) + ' ' + PATTERN_NAME[look.pattern];
    }
    return [head].concat(extras(look)).join(', ');
  }

  /** Text labels for a look. */
  function describe(look) {
    const white = look.color === 'white';
    return {
      title: title(look),
      color: COLOR_NAME[look.color],
      shade: white ? 'Hidden by white' : SHADE_NAME[look.shade || 'full'],
      pattern: white ? 'Hidden by white' : cap(PATTERN_NAME[look.pattern]),
      spotting: white ? 'Hidden by white' : look.spotted ? 'White patches' : 'None',
      sheen: OPAL_NAME[look.opal || 'none'],
      speckles: look.speckled ? 'Gold speckles' : 'None',
      tips: look.gilded ? 'Gilded' : 'Plain',
      glow: look.glow ? 'Glowing' : 'None',
      horns: look.horned ? 'Horned' : 'Polled',
      sex: look.sex === 'ram' ? 'Ram' : 'Ewe',
      sexIcon: SEX_ICON[look.sex] || '',
      hornTag: (SEX_ICON[look.sex] || '') + ' ' + (look.horned ? 'Horned' : 'Polled'),
    };
  }

  /**
   * One part of a look in a few words, for messages about that part:
   * pattern, dark color, shade, spots, horns, opal, speckle or glow.
   */
  function part(look, which) {
    switch (which) {
      case 'pattern': return look.color === 'white' ? 'white' : PATTERN_NAME[look.pattern];
      case 'dark color': return COLOR_NAME[look.color].toLowerCase();
      case 'shade': return SHADE_NAME[look.shade || 'full'].toLowerCase();
      case 'spots': return look.spotted ? 'white patches' : 'no patches';
      case 'horns': return describe(look).hornTag;
      case 'opal': return look.opal === 'full' ? 'opal' : look.opal === 'patchy' ? 'patchy opal' : 'no opal';
      case 'speckle': return look.speckled ? 'speckled' : 'no speckles';
      case 'glow': return look.glow ? 'glowing' : 'no glow';
      default: return title(look);
    }
  }

  /** Round swatch as an HTML string, with horns if the look is horned. size: xs | sm | md | lg | xl */
  function swatch(look, size) {
    const cls = ['swatch', 'swatch-' + (size || 'md')];
    if (look.color === 'white') cls.push('is-white');
    if (look.spotted && look.color !== 'white') cls.push('is-spotted');
    if (look.gilded) cls.push('is-gilded');
    if (look.glow) cls.push('is-glowing');
    if (look.horned && size !== 'xs') cls.push('has-horns');
    // Predicted looks have no horned field, so only real sheep get horns.
    // The smallest swatches leave them out: at 14px they're just specks.
    const label = title(look) + (look.horned ? ', horned' : '');
    const horns = look.horned && size !== 'xs' ? hornsSVG(look.sex) : '';
    return '<span class="' + cls.join(' ') + '" style="background:' + background(look) +
      '" role="img" aria-label="' + label + '" title="' + label + '">' + horns + '</span>';
  }

  const notWhite = look => look.color !== 'white';
  const always = () => true;

  /**
   * Every look a flock can show, in the sheep panel's order and words, as
   * [part, choices, seen]. Each choice is { value, label, test(look) }, and
   * seen(look) says whether the part shows on that sheep at all: white hides
   * shade, pattern and spotting, so their choices match only sheep that aren't
   * white. has(key) says whether the flock has that gene.
   */
  function lookGroups(has, fantasy) {
    const item = (value, label, test) => ({ value, label, test });
    const yesNo = (key, yes, no, test) => [item(key + ':yes', yes, test), item(key + ':no', no, p => !test(p))];
    const colors = ['white', 'black', 'brown'].concat(has('hue') ? ['rose', 'blue', 'violet'] : []);
    return [
      ['Color', colors.map(c => item('color:' + c, COLOR_NAME[c], p => p.color === c)), always],
      has('dilution') && ['Shade', ['full', 'dusk', 'frost'].map(k =>
        item('shade:' + k, SHADE_NAME[k], p => notWhite(p) && (p.shade || 'full') === k)), notWhite],
      ['Pattern', ['solid', 'badgerface', 'mouflon', 'mixed'].map(k =>
        item('pattern:' + k, cap(PATTERN_NAME[k]), p => notWhite(p) && p.pattern === k)), notWhite],
      ['Spotting', [item('spots:yes', 'White patches', p => notWhite(p) && p.spotted),
        item('spots:no', 'No white patches', p => notWhite(p) && !p.spotted)], notWhite],
      has('opal') && ['Sheen', [['full', 'Opal'], ['patchy', 'Patchy opal'], ['none', 'No opal']].map(([k, label]) =>
        item('opal:' + k, label, p => (p.opal || 'none') === k)), always],
      has('speckle') && ['Speckles', yesNo('speckle', 'Speckled', 'No speckles', p => p.speckled), always],
      fantasy && ['Tips', yesNo('gilded', 'Gilded', 'Plain tips', p => p.gilded), always],
      has('lantern') && ['Glow', yesNo('glow', 'Glowing', 'No glow', p => p.glow), always],
      ['Horns', yesNo('horns', 'Horned', 'Polled', p => p.horned), always],
    ].filter(Boolean);
  }

  /** An empty dashed circle, for a lamb that doesn't develop. */
  function emptySwatch(size, label) {
    return '<span class="swatch swatch-' + (size || 'md') + ' is-empty" role="img" aria-label="' + (label || 'No lamb') + '"></span>';
  }

  root.SheepDisplay = {
    swatch, emptySwatch, describe, part, background, title, lookGroups, sexIcon: sex => SEX_ICON[sex] || '',
    COLOR_NAME, SHADE_NAME,
  };
})(typeof window !== 'undefined' ? window : globalThis);
