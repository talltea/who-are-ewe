// Plays through the game in headless Chrome and fails on any page error.
//
//   node browser-check.mjs
//
// Needs Node 22 or later and Google Chrome. Set CHROME to Chrome's path if
// it isn't in the usual place.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(join(import.meta.dirname, 'index.html')).href;
// Saves are written from the engine test page: the game would save over
// them as it's left.
const QUIET = pathToFileURL(join(import.meta.dirname, 'test.html')).href;
const KEY = 'sheep-genetics-sandbox/v1';
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync);

if (!CHROME) {
  console.error('Chrome not found. Set CHROME to its path.');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'who-are-ewe-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

let failed = 0;
const errors = [];

function check(name, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || detail === undefined ? '' : ': ' + detail));
}

async function connect() {
  // Chrome picks a free port and writes it into the profile.
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const page = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const waiting = new Map();
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.id) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (waiting.has(msg.method)) { waiting.get(msg.method)(); waiting.delete(msg.method); }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map(a => a.value || a.description).join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text);
  });
  const send = (method, params = {}) => new Promise(r => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  return {
    send,
    async go(url) {
      const loaded = new Promise(r => waiting.set('Page.loadEventFired', r));
      await send('Page.navigate', { url });
      await loaded;
      await sleep(300);
    },
    async js(expr) {
      const res = (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception.description);
      return res.result.value;
    },
    size: (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }),
  };
}

const sheepCount = p => p.js(`parseInt(document.getElementById('flock-count').textContent)`);
const view = (p, name) => p.js(`document.querySelector('[data-view="${name}"]').click(); !document.getElementById('view-${name}').hidden`);

// Puts the first ram and ewe that can breed in the pen and breeds them.
const breedOnce = p => p.js(`(() => {
  const cards = [...document.querySelectorAll('#grid .card[data-id]')];
  const ready = sex => cards.find(c => c.querySelector('.sex').textContent.includes(sex) &&
    c.querySelector('.pen-btn') && !c.querySelector('.pen-btn').disabled);
  const ram = ready('♂'), ewe = ready('♀');
  if (!ram || !ewe) return false;
  ram.querySelector('.pen-btn').click();
  document.querySelector('#grid .card[data-id="' + ewe.dataset.id + '"] .pen-btn').click();
  document.querySelector('[data-act="breed"]').click();
  return true;
})()`);

// A fantasy flock with 30 litters, some retired sheep and a founder added
// partway, saved where the game will load it.
const seedPlayedFlock = p => p.js(`(() => {
  const E = SheepEngine;
  const f = E.createFlock({ rng: E.mulberry32(7), fantasy: true, maxSize: E.MAX_FLOCK_SIZE });
  for (const sex of ['ewe', 'ram', 'ewe', 'ewe', 'ram', 'ewe', 'ram', 'ewe']) f.addSheep({ sex });
  for (let n = 0; n < 30; n++) {
    const pool = f.list().filter(r => f.breedingsLeft(r.id) > 0);
    const rams = pool.filter(r => r.sex === 'ram'), ewes = pool.filter(r => r.sex === 'ewe');
    if (!rams.length || !ewes.length || f.room() <= 0) break;
    const { lambs } = f.breed(rams[n % rams.length].id, ewes[n % ewes.length].id);
    for (const l of lambs) if (l.phenotype.fleece.diameter > 29) f.retire(l.id);
    if (n === 10) f.addSheep({ sex: 'ram' });
  }
  localStorage.setItem('${KEY}', JSON.stringify({ format: 'sheep-genetics-sandbox', version: 2, savedAt: new Date().toISOString(),
    flock: f.exportState(), notes: {}, goal: { text: '', alleles: {} }, ui: { view: 'history' } }));
  return { sheep: f.list().length, litters: f.diversityHistory().filter(h => h.kind === 'litter').length };
})()`);

try {
  const p = await connect();
  await p.size(1300, 900);

  await p.go(PAGE);
  check('a new game starts with 8 sheep', await sheepCount(p) === 8);
  check('every script loads with a version', await p.js(`[...document.scripts].filter(s => s.src).every(s => /\\?v=/.test(s.src))`));

  check('breeding through the pen works', await breedOnce(p) && await sheepCount(p) > 8);
  const afterBreeding = await sheepCount(p);
  await p.go(PAGE);
  check('the flock is still there after a reload', await sheepCount(p) === afterBreeding);

  check('History opens with a birth record and fleece charts', await view(p, 'history') &&
    await p.js(`!!document.querySelector('.br-grid .br-sheep') && document.querySelectorAll('[data-chart="diameter"] .hc-dot').length > 8`));
  check('the guide opens', await view(p, 'guide') && await p.js(`document.getElementById('view-guide').textContent.length > 2000`));
  check('back to the flock', await view(p, 'flock'));

  await p.go(QUIET);
  const seeded = await seedPlayedFlock(p);
  await p.go(PAGE);
  check('a played flock loads into History', await p.js(`document.querySelectorAll('.br-sheep').length`) === seeded.sheep);
  check('every litter is in the birth record', await p.js(`document.querySelectorAll('.br-cell:not(.br-added)').length`) === seeded.litters);

  await p.size(390, 844);
  await p.go(PAGE);
  check('History fits a phone screen', await p.js(`document.documentElement.scrollWidth`) <= 390);
  await view(p, 'flock');
  check('the flock fits a phone screen', await p.js(`document.documentElement.scrollWidth`) <= 390);
  await p.size(1300, 900);

  await p.go(QUIET);
  await p.js(`localStorage.setItem('${KEY}', '{not a flock'); 1`);
  await p.go(PAGE);
  check('an unreadable save is kept aside', await p.js(`localStorage.getItem('${KEY}/unreadable')`) === '{not a flock');
  check('and the player is told', /couldn't be opened/.test(await p.js(`document.getElementById('toast').textContent`)));
  check('and a new flock starts', await sheepCount(p) === 8);

  check('no page errors', errors.length === 0, errors.join('\n  '));
} catch (e) {
  check('the check ran to the end', false, e.message);
} finally {
  chrome.kill();
  await sleep(200);
  rmSync(profile, { recursive: true, force: true });
}

console.log(failed ? failed + ' failed' : 'All passed');
process.exit(failed ? 1 : 0);
