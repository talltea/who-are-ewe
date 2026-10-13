/* Sheep Genetics Sandbox: display helper.
 *
 * Phenotype in, swatch and labels out. This is the only code that draws a
 * sheep, and it never sees a genotype. A phenotype ("look") is
 *   { sex, color: white|black|brown, pattern: none|solid|badgerface|mouflon|mixed,
 *     spotted, horned }
 */
(function (root) {
  'use strict';

  const WHITE = '#f4f0e6';
  const PIGMENT = {
    black: { dark: '#2a2522', light: '#d3bf9c' },
    brown: { dark: '#6c4128', light: '#e3cdb0' },
  };

  const COLOR_NAME = { white: 'White', black: 'Black', brown: 'Moorit' };
  const PATTERN_NAME = {
    none: '', solid: 'solid', badgerface: 'badgerface', mouflon: 'mouflon', mixed: 'badgerface/mouflon',
  };
  const TEXT = '︎'; // keep ♂ ♀ as text glyphs, not emoji
  const SEX_ICON = { ram: '♂' + TEXT, ewe: '♀' + TEXT };

  function halves(top, bottom) {
    return 'linear-gradient(to bottom, ' + top + ' 0 50%, ' + bottom + ' 50% 100%)';
  }

  /** CSS background for a look. */
  function background(look) {
    if (look.color === 'white') return WHITE;
    const p = PIGMENT[look.color];
    switch (look.pattern) {
      case 'badgerface': return halves(p.light, p.dark);
      case 'mouflon': return halves(p.dark, p.light);
      case 'mixed':
        return halves(p.light, p.dark) + ' left / 50% 100% no-repeat, ' +
               halves(p.dark, p.light) + ' right / 50% 100% no-repeat';
      default: return p.dark;
    }
  }

  function title(look) {
    if (look.color === 'white') return 'White';
    return COLOR_NAME[look.color] + ' ' + PATTERN_NAME[look.pattern] + (look.spotted ? ', spotted' : '');
  }

  /** Text labels for a look. */
  function describe(look) {
    const white = look.color === 'white';
    return {
      title: title(look),
      color: COLOR_NAME[look.color],
      pattern: white ? 'Hidden by white' : PATTERN_NAME[look.pattern][0].toUpperCase() + PATTERN_NAME[look.pattern].slice(1),
      spotting: white ? 'Hidden by white' : look.spotted ? 'White patches' : 'None',
      horns: look.horned ? 'Horned' : 'Polled',
      sex: look.sex === 'ram' ? 'Ram' : 'Ewe',
      sexIcon: SEX_ICON[look.sex] || '',
      hornTag: (SEX_ICON[look.sex] || '') + ' ' + (look.horned ? 'Horned' : 'Polled'),
    };
  }

  /** Round swatch as an HTML string. size: xs | sm | md | lg | xl */
  function swatch(look, size) {
    const cls = ['swatch', 'swatch-' + (size || 'md')];
    if (look.color === 'white') cls.push('is-white');
    if (look.spotted && look.color !== 'white') cls.push('is-spotted');
    const label = title(look);
    return '<span class="' + cls.join(' ') + '" style="background:' + background(look) +
      '" role="img" aria-label="' + label + '" title="' + label + '"></span>';
  }

  root.SheepDisplay = { swatch, describe, background, title, sexIcon: sex => SEX_ICON[sex] || '' };
})(typeof window !== 'undefined' ? window : globalThis);
