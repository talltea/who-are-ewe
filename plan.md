# Who Are Ewe? Game plan

Oct 13, 2026

## Concept

A single-page breeding toy. You start with a small flock, pick a ram and a ewe, and see their lambs. Players only ever see what a sheep looks like; the genes underneath stay hidden. They record their own guesses about each sheep's genes and test them by breeding: two white parents producing a black lamb, a polled ewe whose sons grow horns. A built-in Genetics guide explains how it all works. There is no calendar, economy, or goal beyond what the player sets for themselves.

## Scope

**In:**

- Coat color and markings, horns, and a handful of fleece traits.
- A phenotype-only view of every sheep, with player notes and genotype guesses.
- Breeding, offspring predictions from the player's guesses, pedigrees, inbreeding.
- A Genetics guide page with examples.
- Saving the flock in the browser.

**Out:** time, money, quests, competitions, spinning and knitting.

## Genetics model

**Single-gene traits.** Each animal has two alleles per gene, one from each parent.

| Gene | Alleles (dominant first) | Effect |
| --- | --- | --- |
| Agouti | white > badgerface = mouflon > solid | White hides all color genes underneath |
| Extension | dominant black > normal | Black overrides agouti patterns |
| Brown | normal > brown | Two copies turn black pigment brown (moorit) |
| Spotting | normal > spotted | Two copies add white patches |
| Horns | horned / polled | Sex-influenced: heterozygous rams are horned, heterozygous ewes are polled |
| Booroola | additive | Each copy adds to litter size |

Badgerface and mouflon are codominant: a sheep with one of each shows both patterns blended.

**How color is decided**, checked in this order:

1. Any copy of the white agouti allele: the sheep is white. Stop.
2. Any copy of dominant black: the sheep is solid black, or brown if it has two brown alleles.
3. Otherwise, the agouti alleles decide the pattern, and the brown gene decides whether the pigment is black or brown.
4. If it has two spotting alleles, add white patches on top.

**Fleece traits.** These are controlled by many genes, so they are modeled as numbers.

| Trait | Heritability |
| --- | --- |
| Fiber diameter (microns) | 0.6 |
| Staple length | 0.5 |
| Crimp | 0.4 |
| Luster | 0.5 |

Each sheep has a hidden genetic value for each trait. A lamb's genetic value is its parents' average plus random variation. What the player sees is that genetic value plus environmental noise; heritability controls how much of what they see is genes versus noise.

**Inbreeding.** Calculate each lamb's inbreeding coefficient from its pedigree. Apply a small penalty to its fleece and litter size, scaled by that coefficient.

## Screens and UI

Two views, switched from a tab bar at the top: **Flock** (a grid with a side panel) and **Genetics guide**. The page is neutral and light, with the sheep as the only color.

**Flock grid (main area)**

- A card per sheep: a color swatch, its name, a ♂/♀ icon, and its generation.
- Filter by sex. Sort by any fleece trait.
- Button to add a random sheep.

**Sheep panel (click a card)**

- A larger color swatch with the sheep's name and sex.
- Visible traits only: color, pattern, horns, sex, litter history, and measured fleece stats shown as simple bars.
- A **My notes** area: a genotype guess for each gene, plus free-text notes (see Player notes).
- Mini pedigree: parents and grandparents, each with its swatch.
- Inbreeding percentage, calculated from the pedigree.
- Buttons: rename, remove from flock.

**Breeding panel**

- Two slots, one for a ram and one for a ewe, filled by clicking cards.
- Offspring prediction built from the player's own guesses: chance of each color and pattern, and horn odds by sex. Unknown alleles count as "?", and the prediction says which outcomes depend on them.
- Expected range for each fleece trait, from the parents' measured values.
- A Breed button: one to three lambs appear in the grid, briefly highlighted.

**Small touches**

- **Surprise flag:** when a lamb looks impossible under the player's guesses for its parents, the lamb's card and the parents' notes get a flag naming which guess it contradicts. It uses only what the player wrote and what the lamb looks like.
- Filter the flock by any guessed allele, for example "sheep I think carry brown".
- Undo the last breeding.

## Player notes

Players never see genotypes, so the notes are where their understanding lives.

- Each gene gets a two-slot guess, each slot picked from that gene's alleles or "?". Example for a white ewe: Agouti = white / ?, Brown = normal / brown.
- Each slot can be marked **sure** or **hunch**, shown as solid or outlined chips on the sheep's card.
- A free-text box for reasoning, e.g. "Threw a moorit lamb with Juniper, so she must carry brown."
- Lambs start with every slot set to "?". A button offers the parents' guessed alleles as candidates to choose from.
- Notes are saved with the flock and included in export.

## Genetics guide page

A second view that teaches sheep genetics, using the same color swatches as the flock so examples match what players see. It explains genes in general and never reveals anything about the player's own sheep.

1. **The basics:** genes, alleles, one allele from each parent, dominant and recessive. Example: a Punnett square for two sheep carrying spotting.
2. **Coat color, step by step:** the four-step color order, each step shown with example swatches. Example: why two white parents can produce a black lamb.
3. **Each gene in turn:** agouti, extension, brown, spotting. Swatches for every phenotype, plus a note on real breeds where it shows up, such as badgerface in Badger Face Welsh Mountain sheep and moorit in Shetlands.
4. **Horns and sex:** the same genotype shown in a ram and in a ewe.
5. **Booroola:** additive effects, with litter sizes for zero, one and two copies.
6. **Fleece traits and heritability:** why fine-fiber parents usually, but not always, have fine-fiber lambs, with a small chart of lamb values scattered around the parent average.
7. **Inbreeding:** what the coefficient means, with a short example pedigree.
8. **Detective tips:** how to test-breed, for example breeding a white ram to solid-colored ewes to find out what he carries.

Each Punnett square is interactive: dropdowns set the parents' alleles, and the lamb swatches and percentages update live.

## Sheep display

No drawings for now. Each sheep is shown with a small color swatch and text labels, built from its phenotype only. One display helper takes the phenotype and returns the swatch and labels; it never sees the genotype.

- **Base color:** a round swatch filled with the coat color: white, black, or brown (moorit).
- **Pattern:** the swatch splits into top and bottom halves. Badgerface is light on top and dark below; mouflon is the reverse; a badgerface/mouflon mix shows both bands; solid sheep are one color.
- **Spotting:** a small white dot on the swatch.
- **Horns and sex:** short text tags, e.g. "♂ Horned" or "♀ Polled".
- **Fleece:** the existing stat bars.

It's all plain CSS (a rounded div with a two-stop gradient), so there are no images to make. Because only the display helper renders sheep, drawn sheep can replace the swatches later without touching anything else.

## Technical approach

- One HTML file with plain JavaScript. No build step and no server.
- Three separate parts: the genetics engine (breed, decide phenotype, predict offspring from guesses), the display helper (phenotype in, swatch and labels out), and the UI.
- Genotypes live only inside the engine's data. The UI reads phenotypes and the player's notes, never genotypes.
- Flock and notes saved in browser storage, with export and import as a file.
- The save file holds genotypes, so a curious player could peek. Light encoding is enough to keep it honest.
- Keeping the engine separate makes it easy to lift into the main game later.

## Build order

1. **Genetics engine:** genes, breeding, phenotype rules, and a text-only test page that prints outcomes.
2. **Phenotype display:** swatches and trait labels.
3. **Flock grid and sheep panel**, phenotype only.
4. **Player notes and guesses.**
5. **Breeding panel**, predictions from guesses, and the surprise flag.
6. **Fleece traits and stat bars.**
7. **Pedigree and inbreeding.**
8. **Genetics guide page** with interactive Punnett squares.
9. **Saving, import/export, polish.**

## Stretch ideas

- Drawn SVG sheep that replace the swatches, built in layers from the phenotype: body, pattern, spots, luster, horns.
- A fantasy gene pack: X-linked opal sheen visible only in ewes, temperature-sensitive points, unstable alleles that occasionally produce rare speckles.
- Callipyge, with its parent-of-origin rule.
- Starter breed presets (Shetland, Merino, Wensleydale) with typical gene frequencies.
- An optional "check my notes" button that scores guesses against the true genotype, off by default.
- A deduction helper that points out what the flock's lambs prove, e.g. "Bramble must carry a non-white agouti allele."
