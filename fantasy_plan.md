# Fantasy Genes: Implementation Plan

Adds optional fantasy genes to the Sheep Genetics Sandbox: **Dilution, Hue, Speckle, Lantern and Gilded**, plus **Opal**, which is built but hidden behind a dev flag. Each one teaches a different real genetic mechanism. They are off by default and switched on per flock with a checkbox.

**Status:** implemented. Opal is dev-only: open the game with `?dev=opal` to include it in new fantasy flocks. See [Implementation notes](#implementation-notes) for where the build differs from this plan.

## Design rules

1. **Layers, not tangles.** Fantasy genes act after the base color rules (agouti, extension, brown, spotting) and never change them. The only things a fantasy gene may ask are "is this sheep white?" and, for Hue, "what is the dark color?".
2. **One new rule per gene.** If a gene needs two new rules to explain, simplify it.
3. **Every look stays readable.** A player must be able to tell phenotypes apart from the swatch plus its labels.

## The genes

| Gene | Mechanism | Alleles | Rule | White sheep |
|---|---|---|---|---|
| Dilution | Incomplete dominance | D (full), d (dilute) | D/D full shade, D/d **dusk**, d/d **frost**. Lightens the dark color and pattern. | Hidden |
| Hue | Codominance | Hu⁺ (normal), Huʳ (rose), Huᵇ (blue) | r/r **rose**, b/b **blue**, r/b **violet**, anything with + is normal. Hue replaces the dark color, so Brown no longer shows. | Hidden |
| Opal *(dev only)* | Sex linkage (X chromosome) | Xᴼ (opal), X⁺ (plain) | Rams have one X: opal or plain. Ewes: one copy **patchy opal**, two copies **full opal**. Sons inherit opal only from their dam. | Visible |
| Speckle | Mutation | St (normal), st (speckled) | st/st has tiny gold speckles. A normal allele mutates to st in about 1 in 200 gametes. | Visible |
| Lantern | Lethal allele | L (glow), + (plain) | One copy glows. L/L lambs don't develop, so L/+ × L/+ gives 2 glowing : 1 plain, and smaller litters. | Visible |
| Gilded | Threshold trait | none (many genes) | Hidden score inherited like fleece traits. Gold-tipped fleece only when the score passes a cutoff. | Visible |

**Hue simplification:** an earlier idea had one copy of rose or blue give a pale tint. That doubled the number of colors and made dusk rose hard to tell from tinted rose. Making rose and blue recessive to normal keeps 1 rose : 2 violet : 1 blue from violet × violet, adds hidden carriers, and keeps the palette to 5 dark colors × 3 shades.

**Gene symbols** avoid clashing with existing ones: H is horns and F is Booroola, so Hue uses Hu and Lantern uses L.

## How the look is decided

The existing order stays, with fantasy steps after it:

1. **White?** Any Aʷ: white. Dilution and Hue are hidden. Skip to step 6.
2. **Pattern:** agouti + extension, unchanged.
3. **Dark color:** Hue if r/r, b/b or r/b; otherwise black or moorit from Brown.
4. **Shade:** Dilution makes the dark color full, dusk or frost. The light part of badgerface/mouflon patterns stays as it is.
5. **Spots:** unchanged.
6. **Surface effects, on every sheep:** opal (none, patchy, full), speckles, gilded tips, glow.

## Engine changes (js/engine.js)

### Feature flag and gene lists

- Split `GENES` into `BASE_GENES` and `FANTASY_GENES`. A flock created with `{ fantasy: true }` uses both. A flock exposes `activeGenes()` and the UI only ever iterates that list.
- Genotypes of non-fantasy flocks have no fantasy keys. Every phenotype function treats a missing gene as its normal allele, so base flocks behave exactly as today.
- Mark genes with flags the generic code can read: `xLinked` (Opal), `lethal: 'glow'` (Lantern), `mutatesTo: 'speckled'` (Speckle), `hiddenByWhite` (Dilution, Hue).
- A `dev` flag (Opal) keeps a fantasy gene out unless the flock is created with `devGenes: ['opal']`. The UI passes that only when the page URL has `?dev=opal`.

### Factored color prediction (do this first)

Predictions and surprise checks currently try every combination of every "?" across all color genes at once. Adding Dilution and Hue to that one group would multiply the worst-case work by roughly 150×.

But given that a sheep isn't white, its color splits into independent parts:

| Factor | Genes |
|---|---|
| White or pattern | agouti, extension |
| Dark color | brown, hue |
| Shade | dilution |
| Spots | spotting |

Predict each factor separately with the existing `predictOutcomes`, then combine: P(white) comes from the first factor; every non-white outcome is the product of the four factors' probabilities. For the min/max ranges, multiply the mins and multiply the maxes.

Surprise checks factor the same way: a lamb's look is possible only if each factor is possible, and for a white lamb only the first factor is checked. Issue messages get more specific: "pattern", "dark color", "shade", "spots" instead of just "color".

Ship this refactor with a regression test that compares old and new predictions on random guesses for the base genes before adding any new gene.

### Dilution and Hue

- Join the color factors above. Both are ordinary two-slot genes, so `inheritGenotype`, notes and checks work unchanged.
- `colorOf` gains a `shade` field on the look, and a showing hue becomes the look's `color` (`rose`, `blue`, `violet`), since it replaces the dark color. `colorKey` includes both.

### Lantern

- **Founders** never get L/L: re-draw that gene if it comes up.
- **Breeding:** pick the litter size as today, generate each lamb, then drop any L/L lamb. Store the number lost on the litter record (`lost: 1`). A litter can end up empty.
- **Predictions** show "not born" as its own outcome row, e.g. glowing 50%, plain 25%, not born 25%. This avoids renormalizing ranges.
- **Checks:** a living sheep can never be L/L, so `checkSelf` flags a guess of L/L.

### Speckle

- In `inheritGenotype`, each transmitted `normal` speckle allele becomes `speckled` with probability `SPECKLE_MUTATION_RATE = 0.005`.
- **Predictions** ignore mutation in the percentages and add a one-line footnote.
- **Surprise checks:** if a speckled lamb is impossible under the guesses but possible once either parent may pass on st, return `{ trait: 'speckle', rare: true }`. The UI shows it as "Rare: could be a new mutation", not as a contradiction.

### Opal (sex-linked, dev only)

Hidden from players for now: only fantasy flocks started with `?dev=opal` have it. Everything below is built and tested.

- **Storage** keeps the `[fromSire, fromDam]` convention. Rams store `[null, x]` (their sire gave a Y). Ewes store two alleles.
- **Breeding:** pick each lamb's sex *before* its genotype (today sex is picked after). A ram lamb gets `[null, random dam allele]`. A ewe lamb gets `[sire's X, random dam allele]`.
- **Founders:** rams get `[null, random]`.
- **Predictions** run per lamb sex, like horns. `lambPairs` needs an X-linked variant that takes the lamb's sex.
- **Checks:** `pairsFromParents`, `checkSureGuesses` and `checkSelf` skip the null slot. A ram's guess for Opal has one slot.

### Gilded (threshold)

- Add `LIABILITIES = [{ key: 'gild', h2: 0.5, threshold: 1.0 }]` on a standard-normal scale. A threshold of 1.0 gilds about 16% of founders.
- Reuse `founderBreedingValues` and `lambBreedingValues` for the hidden score. The measured score is the score plus environmental noise, and the phenotype is only `gilded: score > threshold`. The score itself is never shown.
- **Prediction:** estimate each parent's score from public records the same way `estimate()` does for fleece, using the expected score of a gilded sheep (φ(t) / (1 − Φ(t))) or an ungilded one (−φ(t) / Φ(t)) as its "own" value. A lamb's chance of being gilded is `1 − Φ((t − midparent estimate) / √(1 − h²/2))`. Show it as "about 35% chance".
- No notes row and no surprise flag: a threshold trait can always surprise.

### Saving

- Export `v: 2` with a `fantasy` boolean and a `devGenes` list. Import accepts v1 saves as non-fantasy flocks. A flock made with a dev gene keeps it after loading, with or without the flag.
- The scrambled secret includes the new genes and the gild score.

### Starting frequencies (tune by playtesting)

| Gene | Frequencies | Rough result in founders |
|---|---|---|
| Dilution | dilute 0.3 | 42% dusk, 9% frost (of non-white) |
| Hue | rose 0.2, blue 0.2 | 4% rose, 4% blue, 8% violet (of non-white) |
| Opal (dev only) | opal 0.2 | 20% of rams opal; 32% of ewes patchy, 4% full |
| Speckle | speckled 0.25 | 6% speckled |
| Lantern | glow 0.15 | about 26% glowing (L/L founders are redrawn) |
| Gilded | threshold 1.0 | about 16% gilded |

## Display changes (js/display.js)

All CSS, no images:

- **Shade and hue:** one palette table, `PIGMENT[darkColor][shade]`, for black, moorit, rose, blue and violet at full, dusk and frost.
- **Opal:** a faint pastel conic-gradient overlay over the whole swatch. Patchy is soft pastel blobs over about half of it: a half or quarter overlay looked too much like the badgerface/mouflon pattern.
- **Speckle:** 5–6 tiny gold dots in fixed positions, clearly different from spotting's single white dot.
- **Gilded:** a thin gold ring.
- **Lantern:** a soft warm glow around the swatch (`box-shadow`).
- **Labels:** "What you can see" gains rows for shade, dark color, sheen, speckles, tips and glow. Titles read like "Frost violet badgerface, opal, glowing".

## UI changes (js/ui.js)

- **New flock:** a small dialog with an "Include fantasy genes" checkbox. Show a "Fantasy" badge in the header when the flock has it on.
- **Finding it:** players start with a generated classic flock, so the checkbox alone is easy to miss. Fantasy genes are offered in three places:
  - the welcome panel, which swaps an untouched starter flock straight away;
  - the breeding pen, as a dismissible tip after six litters;
  - the end of the guide.
  
  For a flock that's been used, these open the New flock dialog with the box ticked.
- **Notes:** fantasy genes go in a collapsible "Fantasy genes" group below the base genes. Opal shows one slot for rams, with "Y" in the left slot, where the sire's allele goes everywhere else. Gilded gets no row, just a line pointing to the guide.
- **Breeding pen:** new prediction rows for shade, dark color, opal by sex, speckle, glow (including "not born") and gilded chance.
- **Litter history:** show losses gently, e.g. "2 lambs · 1 didn't develop". Lantern's 2:1 ratio is only discoverable if players can see this.
- **"Guessed to carry" filter:** include the new alleles.

## Guide changes (js/guide.js)

A "Fantasy genes (made up)" section, shown when the current flock has them on, with one short part per gene, each reusing existing widgets:

- **Dilution:** Punnett square showing 1 full : 2 dusk : 1 frost.
- **Hue:** violet × violet Punnett square; note that hue hides brown.
- **Opal** (only when the flock has it): a Punnett square with X and Y on the ram's edge, showing that sons get opal only from their dam.
- **Speckle:** Punnett square plus a note on mutation.
- **Lantern:** Punnett square with the L/L cell marked "doesn't develop", and the 2:1 ratio.
- **Gilded:** the heritability scatter chart with a threshold line.

Add a final box to the "read a sheep in order" walkthrough: "For any sheep: sheen? speckles? gilded tips? glow?" (no sheen question without Opal).

## Tests (js/engine.test.js)

- Factored predictions match the old brute-force predictions on random base-gene guesses.
- Dilution 1:2:1; violet × violet 1:2:1; hue hides brown; white hides hue and dilution.
- Opal: ram lambs always carry one of the dam's alleles, never the sire's; ewe lambs always carry the sire's X.
- Speckle mutation rate ≈ 0.005 per gamete over many lambs.
- Lantern: no living L/L ever; L/+ × L/+ gives ≈ 2:1 among born lambs and ≈ 25% lost.
- Gilded: ≈ 16% of founders gilded; lamb rate rises with parent status.
- Worst-case `predictOffspring` with every slot "?" stays under ~50 ms.
- Saving and loading both v1 and v2 files.

## Build order

1. **Plumbing:** feature flag, active gene lists, v2 saves, new-flock checkbox, and the factored prediction refactor with its regression test.
2. **Dilution and Hue,** with the new palette.
3. **Lantern.**
4. **Speckle.**
5. **Opal:** the largest change, because of sex-linked storage. Now behind the dev flag.
6. **Gilded.**
7. **Guide section** and the walkthrough box.

Each step leaves a working game.

## Implementation notes

Where the build differs from or adds to the plan above:

- **Opal is dev-only.** It's complete, but hidden from players until it's wanted.
- **Living parents aren't L/L.** Predictions and surprise checks treat a parent noted L/? as L/+, so two glowing parents predict exactly 50% glowing, 25% plain, 25% not born.
- **What counts as rare.** A speckled lamb is marked rare only if one new mutation, in either parent, would explain it. Needing two mutations (about 1 in 40,000) is flagged as a normal surprise.
- **Pen breakdown.** With fantasy genes, combined looks get numerous, so the pen also shows dark color and shade on their own for lambs that aren't white.
- **Lost lambs are shown,** gently worded: "2 lambs · 1 didn't develop", and in the toast after breeding.

## Open decisions

- Whether and when to release Opal.
- Founder frequencies, after playtesting.
- Four horns and ram's mane were left out. Both are low effort and could be added later using the same flags.
