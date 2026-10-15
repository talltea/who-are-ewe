# Who Are Ewe?

A sheep breeding game about hidden genes. You only see what your sheep look like, so you work out what they carry by breeding them and noting your guesses.

Play it at https://talltea.github.io/who-are-ewe/

Coat color, pattern, spots and horns follow real single-gene rules. Fleece is inherited like a real quantitative trait, and inbreeding has a cost. The Genetics guide in the game explains it all. A new flock can also include five made-up fantasy genes, each an example of a real way genes behave.

Your flock is saved in the browser. Export it to keep a copy or move it to another browser.

## Running it

No build step. Open `index.html` in a browser.

## Tests

```
node --test js/engine.test.js   # the genetics engine
node browser-check.mjs          # plays through the game in headless Chrome
```

The browser check needs Node 22 or later and Chrome. `test.html` runs the engine tests in a browser.

## Publishing

Raise `VERSION` in `index.html` with every change you push. Otherwise a browser can mix the new page with old cached scripts and break.

## Files

- `js/engine.js`: genetics, breeding and saves. The only code that sees your sheep's genes.
- `js/display.js`: turns a sheep's look into a swatch and labels.
- `js/ui.js`: the flock page.
- `js/history.js`, `js/guide.js`: the History and Genetics guide pages.
- `js/tip.js`: tooltips.
- `plan.md`, `fantasy_plan.md`: the original design notes.
