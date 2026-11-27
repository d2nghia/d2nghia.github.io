/** Run with: node --test cube/coach.test.js */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('./solver.js');
const K = require('./capture.js');
const P = require('./progress.js');
const V = require('./validation.js');
const langContext = { module: { exports: {} }, localStorage: { getItem: () => null } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'lang.js'), 'utf8'), langContext);
const LANG = langContext.module.exports;

function fixture({ app = false, reducedMotion = false, solved = false, scramble,
  persistence = false, hash = '', storage = new Map(), storageBlocked = false, autoSolve = true, search } = {}) {
  let now = 0, serial = 0, framesPaused = false;
  const tasks = new Map(), listeners = {}, nodes = new Map(), windowListeners = {}, resizeObservers = [];
  function schedule(fn, delay) {
    const id = ++serial;
    tasks.set(id, { at: now + delay, fn });
    return id;
  }
  function tick(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at;
      tasks.delete(next[0]);
      next[1].fn(now);
    }
    now = end;
  }
  function element() {
    const classes = new Set();
    const el = {
      style: { setProperty(name, value) { this[name] = String(value); } },
      dataset: {}, children: [], hidden: false, clientWidth: 300, clientHeight: 300,
      attributes: {}, handlers: {}, scrollLeft: 0, offsetLeft: 0, offsetWidth: 32, offsetHeight: 56,
      classList: {
        add(...names) { names.forEach(n => classes.add(n)); },
        remove(...names) { names.forEach(n => classes.delete(n)); },
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      removeAttribute(name) { delete this.attributes[name]; },
      getAttribute(name) { return this.attributes[name] ?? null; },
      addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); },
      emit(name, event) { (this.handlers[name] || []).forEach(fn => fn(event)); },
      animate(frames, options) {
        (this.played ||= []).push({ frames, options });
        return { finished: Promise.resolve() };
      },
      setPointerCapture(id) { this.capturedPointer = id; },
      releasePointerCapture() { this.capturedPointer = null; },
      focus() { document.activeElement = this; },
      select() { this.focus(); this.selected = true; },
      contains(node) {
        for (; node; node = node.parent) if (node === this) return true;
        return false;
      },
      getBoundingClientRect() { return { left: 16, top: 20, width: 728, height: 454 }; },
      closest(selector) {
        if (selector === '#share-tools' && ['share-progress', 'share-url', 'share-tools'].includes(this.id)) return get('share-tools');
        if (selector === 'button[data-step]' && this.dataset.step != null) return this;
        if (selector === '#coach-move-track, #coach-resize') {
          for (let node = this; node; node = node.parent) if (['coach-move-track', 'coach-resize'].includes(node.id)) return node;
        }
        return null;
      },
      querySelectorAll() { return []; }, querySelector() { return null; },
      insertAdjacentHTML(position, markup) { this.markup = (this.markup || '') + markup; },
      appendChild(child) { this.children.push(child); child.parent = this; },
      remove() { this.parent.children = this.parent.children.filter(c => c !== this); }
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return this.markup || ''; },
      set(value) { this.markup = value; this.children = []; }
    });
    return el;
  }
  const html = fs.readFileSync(path.join(__dirname, 'solve.html'), 'utf8');
  for (const [tag, id] of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const el = element(); el.id = id;
    el.hidden = /\shidden(?:\s|>)/.test(tag);
    nodes.set(id, el);
  }
  const get = id => { assert.ok(nodes.has(id), 'Missing HTML element: ' + id); return nodes.get(id); };
  const document = {
    body: element(),
    documentElement: { clientWidth: 1200 },
    hidden: false, createElement: element, getElementById: get,
    addEventListener(name, fn) { listeners[name] = fn; }
  };
  const window = {
    CubeLib: { ...L }, CubeCapture: K,
    location: { origin: 'https://example.test', pathname: '/cube/solve.html', search: search ?? (persistence && !autoSolve ? '' : '?autofill=random'), hash },
    innerHeight: 900, scrollTo() {},
    addEventListener(name, fn) { (windowListeners[name] ||= []).push(fn); },
    matchMedia: () => ({ matches: reducedMotion }),
    CubeLang: { t: LANG.t, colour: LANG.colour, apply() {}, onChange(fn) { this.change = fn; }, toggle() { this.change(); } }
  };
  const replacements = [];
  window.history = { replaceState(state, title, url) {
    replacements.push(url);
    const parsed = new URL(url, 'https://example.test');
    Object.assign(window.location, { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash });
  } };
  const context = vm.createContext({
    window, self: window, document, URLSearchParams, Int8Array, btoa, atob, performance: { now: () => now },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; resizeObservers.push(this); }
      observe(host) { this.host = host; }
    },
    navigator: { mediaDevices: { getUserMedia: () => new Promise(() => {}) } },
    setTimeout: schedule, clearTimeout: id => tasks.delete(id),
    clearInterval() {}, requestAnimationFrame: fn => schedule(fn, framesPaused ? 1000000 : 16),
    cancelAnimationFrame: id => tasks.delete(id),
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error('Storage unavailable'); return storage.get(key) || null; },
      setItem(key, value) {
        if (storageBlocked) throw new Error('Storage unavailable');
        storage.set(key, value);
      },
      removeItem(key) {
        if (storageBlocked) throw new Error('Storage unavailable');
        storage.delete(key);
      }
    }
  });
  const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
  run('progress.js');
  run('validation.js');
  run('cubeview.js');
  let coach, capture, suggestion, initial, solution, pendingMove, faceColours, paintSticker;
  if (app) {
    if (solved) window.CubeLib.randomScramble = () => [];
    else if (scramble) window.CubeLib.randomScramble = () => scramble;
    const create = window.CubeView.create;
    window.CubeView.create = function (host, colours) {
      const view = create(host, colours);
      if (host.id === 'cap-issue-cube') suggestion = view;
      if (host.id === 'cap-cube') {
        capture = view;
        const onSticker = view.onSticker;
        view.onSticker = function (cb) { paintSticker = cb; onSticker(cb); };
      }
      if (host.id === 'coach-cube') {
        coach = view;
        faceColours = colours.slice();
        const demonstrate = view.demonstrate;
        view.demonstrate = function (move) { pendingMove = move; return demonstrate(move); };
      }
      return view;
    };
    window.CubeLib.solve = function (state) {
      initial = new Int8Array(state);
      solution = L.solve(state);
      return solution;
    };
    run('app.js');
    if (autoSolve && get('screen-coach').hidden) get('cap-solve').onclick();
  }
  async function settle(ms = 2000) {
    tick(ms);
    await Promise.resolve();
  }
  async function advance(dir = 1) {
    get(dir > 0 ? 'coach-next' : 'coach-back').onclick();
    await settle();
  }
  return { window, document, listeners, windowListeners, resizeObservers, get, tick, tasks, settle, advance,
    storage, replacements,
    /** every painted sticker under a node, whatever it is wrapped in */
    stickersIn(node) {
      const found = [];
      (function walk(el) {
        if (el.dataset && el.dataset.facelet != null) found.push(el);
        (el.children || []).forEach(walk);
      })(node);
      return found;
    },
    /** which way the cube inside a node is facing, whole turns ignored */
    facing(node) {
      const turn = this.cubeIn(node).style.transform.match(/rotateX\((-?[\d.]+)deg\) rotateY\((-?[\d.]+)deg\)/);
      assert.ok(turn, 'The cube should carry a rotation');
      return turn.slice(1).map(angle => ((Number(angle) % 360) + 360) % 360);
    },
    /** the cube element inside a node, live or still */
    cubeIn(node) {
      let found = null;
      (function walk(el) {
        if (!found && el.className === 'cube') found = el;
        if (!found) (el.children || []).forEach(walk);
      })(node);
      return found;
    },
    paint(index, colour) {
      get('cap-palette').children.find(button => button.title === colour).onclick();
      paintSticker(index);
    },
    pauseFrames() { framesPaused = true; },
    replay() { listeners.keydown({ key: ' ', target: get('coach-cube'), preventDefault() {} }); },
    get coach() { return coach; }, get capture() { return capture; },
    get suggested() { return suggestion; }, get initial() { return initial; }, get solution() { return solution; },
    get pendingMove() { return pendingMove; },
    get faceColours() { return faceColours; },
    get moves() { return solution.moves.flatMap(m => m.endsWith('2') ? [m[0], m[0]] : [m]); } };
}

test('all 18 moves repeat from the same state and cancel cleanly', () => {
  const f = fixture(), host = f.get('coach-cube');
  const view = f.window.CubeView.create(host);
  const start = L.applyMoves(L.solvedState(), L.parse("R U F' D L2"));
  for (const face of L.FACE_ORDER) for (const suffix of ['', "'", '2']) {
    view.set(start);
    view.demonstrate(face + suffix);
    const cube = host.children[0];
    const guides = () => cube.children.filter(el => el.className === 'turn-guide');
    assert.equal(guides().length, 5);
    const guideBases = guides().map(el => el.style.transform);
    assert.equal(host.dataset.demoPhase, 'focus');
    const cubies = cube.children.filter(el => el.className === 'cubie');
    const original = cubies.map(el => el.style.transform);
    f.tick(1300);
    assert.equal(host.dataset.demoPhase, 'turn');
    assert.equal(cubies.filter((el, i) => el.style.transform !== original[i]).length, 9);
    const rotation = cubies.find((el, i) => el.style.transform !== original[i]).style.transform.match(/^rotate[XYZ]\([^)]+\) /)[0];
    assert.deepEqual(guides().map(el => el.style.transform), guideBases.map(base => rotation + base),
      'Every direction overlay must share the turning layer\'s angle and axis');
    f.tick(suffix === '2' ? 2930 : 1620);
    assert.equal(host.dataset.demoPhase, 'reset');
    assert.deepEqual(guides().map(el => el.style.transform), guideBases, 'Reset overlays together with the preview');
    assert.deepEqual(cubies.map(el => el.style.transform), original);
    f.tick(20000);
    assert.ok(f.tasks.size > 0, 'The demonstration must keep repeating');
    assert.deepEqual(view.get(), start, 'A repeated preview must never apply turns');
    view.stopDemo();
    assert.equal(guides().length, 0);
    assert.equal(f.tasks.size, 0);
    assert.deepEqual(cubies.map(el => el.style.transform), original);
  }
});

test('strip arrows point along the actual move on every face', () => {
  const f = fixture(), host = f.get('coach-cube'), view = f.window.CubeView.create(host);
  const labels = Int8Array.from({ length: 54 }, (_, i) => i);
  for (const face of L.FACE_ORDER) for (const suffix of ['', "'"]) {
    const move = face + suffix, g = f.window.CubeView.geoOf(move);
    const after = L.applyMoves(labels, [move]);
    view.demonstrate(move);
    const guides = host.children[0].children.filter(el => el.className === 'turn-guide').slice(1);
    const strips = L.FACE_ORDER.map(side => L.FACELETS.filter(c => c.face === side && c.pos['xyz'.indexOf(g.axis)] === g.layer)).filter(c => c.length === 3);
    guides.forEach((guide, i) => {
      const cell = strips[i][1], base = L.FACE_INDEX[cell.face] * 9;
      const source = base + cell.row * 3 + cell.col;
      const dest = L.FACELETS[after.indexOf(source)].pos;
      const delta = dest.map((v, k) => v - cell.pos[k]);
      const grid = L.FACELETS.slice(base, base + 9);
      const dot = (a, b) => delta.reduce((sum, v, k) => sum + v * (grid[b].pos[k] - grid[a].pos[k]), 0);
      const angle = Number(guide.innerHTML.match(/rotate\(([-.\d]+)\)/)[1]) * Math.PI / 180;
      assert.ok(Math.cos(angle) * dot(4, 5) + Math.sin(angle) * dot(4, 7) > 0, move + ' on ' + cell.face);
    });
    view.stopDemo();
  }
});

test('half turns pause at 90 degrees before showing the second turn', () => {
  const f = fixture(), host = f.get('coach-cube'), view = f.window.CubeView.create(host);
  view.demonstrate('R2');
  f.tick(1800);
  const cubies = host.children[0].children.filter(el => el.className === 'cubie');
  assert.equal(cubies.filter(el => el.style.transform.startsWith('rotateX(90deg)')).length, 9);
  f.tick(1300);
  assert.equal(host.dataset.demoPhase, 'hold');
  assert.equal(cubies.filter(el => el.style.transform.startsWith('rotateX(180deg)')).length, 9);
});

test('reduced motion keeps a static highlighted layer and arrows', () => {
  const f = fixture({ reducedMotion: true }), host = f.get('coach-cube');
  const view = f.window.CubeView.create(host);
  view.demonstrate("F'");
  assert.equal(host.children[0].children.filter(el => el.className === 'turn-guide').length, 5);
  assert.equal(f.tasks.size, 0);
});

test('the step guide can still play and commit a turn after a preview', async () => {
  const f = fixture(), host = f.get('coach-cube'), view = f.window.CubeView.create(host);
  const start = L.solvedState();
  view.set(start);
  view.demonstrate('R2');
  f.tick(1300);
  const turn = view.play("U'");
  f.tick(2000);
  await turn;
  assert.deepEqual(view.get(), L.applyMoves(start, ["U'"]));
  assert.equal(f.tasks.size, 0);
  assert.equal(host.children[0].children.filter(el => el.className === 'turn-guide').length, 0);
});

test('confirming at any preview phase continues its visible angle and commits exactly once', async () => {
  const f = fixture(), host = f.get('coach-cube'), view = f.window.CubeView.create(host);
  const start = L.applyMoves(L.solvedState(), L.parse("R U F' D L2"));
  const cubies = host.children[0].children.filter(el => el.className === 'cubie');
  const angles = () => cubies.map(el => Number(el.style.transform.match(/^rotate[XYZ]\(([-.\d]+)deg\)/)?.[1] || 0));
  for (const face of L.FACE_ORDER) for (const suffix of ['', "'", '2']) {
    const move = face + suffix;
    // Focus, mid-turn, hold, fading out, and the hidden reset between repeats.
    for (const elapsed of [0, 1300, 3200, 4200, 4400]) {
      view.set(start);
      view.demonstrate(move);
      f.tick(elapsed);
      const before = angles();
      const turn = view.play(move);
      assert.deepEqual(angles(), before, move + ' must not snap back on confirmation');
      assert.deepEqual(view.get(), start, 'The turn must finish before changing the logical state');
      if (elapsed === 1300) {
        const index = before.findIndex(angle => angle !== 0);
        assert.notEqual(index, -1);
        f.tick(32);
        assert.ok(Math.abs(angles()[index]) > Math.abs(before[index]), move + ' keeps rotating forward');
        assert.deepEqual(view.get(), start);
      }
      f.tick(2000);
      await turn;
      assert.deepEqual(view.get(), L.applyMoves(start, [move]));
      assert.equal(view.busy(), false);
      assert.equal(f.tasks.size, 0, 'A committed preview must not restart');
    }
  }
});

test('Next animates before advancing and rapid clicks, keys, and replay cannot skip a turn', async () => {
  const f = fixture({ app: true }), { get, coach, initial, moves } = f;
  f.tick(1300);
  const cubies = get('coach-cube').children[0].children.filter(el => el.className === 'cubie');
  const pose = () => cubies.map(el => el.style.transform);
  const before = pose();
  get('coach-next').onclick();
  assert.deepEqual(pose(), before, 'Confirmation continues the rotating preview');
  for (const id of ['coach-next', 'coach-back']) assert.equal(get(id).disabled, true);
  assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 1, total: moves.length + 1 }));
  for (let i = 0; i < 5; i++) {
    get('coach-next').onclick();
    get('coach-back').onclick();
    f.replay();
    f.listeners.keydown({ key: 'ArrowRight', repeat: true, preventDefault() {} });
  }
  get('lang-switch').onclick();
  assert.deepEqual(pose(), before, 'Other controls cannot reset an in-flight turn');
  f.tick(400);
  assert.notDeepEqual(pose(), before);
  assert.deepEqual(coach.get(), initial);
  await f.settle();
  assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, 1)));
  assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 2, total: moves.length + 1 }));
  for (const id of ['coach-next', 'coach-back']) assert.equal(get(id).disabled, false);
  assert.equal(get('coach-cube').dataset.demoPhase, 'focus');

  get('coach-back').onclick();
  f.tick(300);
  assert.equal(coach.busy(), true, 'Undo also rotates instead of replacing the state');
  assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, 1)));
  await f.settle();
  assert.deepEqual(coach.get(), initial);
  assert.equal(get('coach-back').disabled, true);
});

test('the final turn finishes rotating before showing completion', async () => {
  const f = fixture({ app: true, scramble: ['U'] }), { get, coach, initial } = f;
  get('coach-next').onclick();
  f.tick(300);
  assert.equal(get('screen-coach').hidden, false);
  assert.equal(get('done-again').hidden, true);
  assert.deepEqual(coach.get(), initial);
  await f.settle();
  assert.equal(get('done-again').hidden, false);
  assert.equal(L.isSolved(coach.get()), true);
  assert.equal(f.tasks.size, 0);
});

test('confirming an already completed preview shows a full slow turn and a pause on every face', async () => {
  const f = fixture(), host = f.get('coach-cube'), view = f.window.CubeView.create(host);
  const start = L.applyMoves(L.solvedState(), L.parse("R U F'"));
  const cubies = host.children[0].children.filter(el => el.className === 'cubie');
  const angles = () => cubies.map(el => Math.abs(Number(el.style.transform.match(/^rotate[XYZ]\(([-.\d]+)deg\)/)?.[1] || 0)));
  for (const face of L.FACE_ORDER) for (const suffix of ['', "'"]) {
    const move = face + suffix;
    view.set(start);
    view.demonstrate(move);
    const guideBases = host.children[0].children.filter(el => el.className === 'turn-guide').map(el => el.style.transform);
    f.tick(1800);
    assert.equal(host.dataset.demoPhase, 'hold');
    assert.equal(angles().filter(angle => angle === 90).length, 9);
    const turn = view.play(move, 1200, { fromStart: true, hold: 300 });
    f.tick(280);
    assert.ok(angles().every(angle => angle === 0), 'Reset the preview before the confirmation turn');
    f.tick(600);
    assert.equal(angles().filter(angle => angle > 35 && angle < 55).length, 9, move + ' is halfway through its visible turn');
    const rotation = cubies.find(el => el.style.transform.startsWith('rotate')).style.transform.match(/^rotate[XYZ]\([^)]+\) /)[0];
    assert.deepEqual(host.children[0].children.filter(el => el.className === 'turn-guide').map(el => el.style.transform),
      guideBases.map(base => rotation + base), 'Confirmed turns carry the arrows with the rotating layer');
    assert.deepEqual(view.get(), start);
    assert.equal(view.busy(), true);
    assert.equal(host.children[0].children.filter(el => el.className === 'turn-guide').length, 5);
    f.tick(800);
    assert.equal(angles().filter(angle => angle === 90).length, 9);
    assert.equal(view.busy(), true, 'Pause on the fully rotated layer before advancing');
    f.tick(200);
    await turn;
    assert.deepEqual(view.get(), L.applyMoves(start, [move]));
    assert.equal(f.tasks.size, 0);
    assert.equal(host.children[0].children.filter(el => el.className === 'turn-guide').length, 0);
  }
});

test('Next takes time to visibly rotate regardless of when the preview is confirmed', async () => {
  for (const elapsed of [0, 1300, 1800, 2800, 2920]) {
    const f = fixture({ app: true, scramble: ['U'] }), { get, coach, initial } = f;
    f.tick(elapsed);
    get('coach-next').onclick();
    await f.settle(800);
    assert.equal(coach.busy(), true, 'A late confirmation must not finish instantly');
    assert.deepEqual(coach.get(), initial);
    assert.equal(get('done-again').hidden, true);
    assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 1, total: 2 }));
    await f.settle(500);
    assert.equal(coach.busy(), true, 'Keep the current step visible through the end pause');
    await f.settle();
    assert.equal(L.isSolved(coach.get()), true);
    assert.equal(get('done-again').hidden, false);
    assert.equal(f.tasks.size, 0);
  }
});

test('done is an extra numbered step that lets the child revisit and repeat the last move', async () => {
  const f = fixture({ app: true, scramble: ['U2'] }), { get, coach, initial } = f;
  coach.look(140, 230);
  await f.advance();
  await f.advance();
  assert.equal(get('screen-coach').hidden, false);
  assert.equal(L.isSolved(coach.get()), true);
  assert.deepEqual({ ...coach.angles() }, { rx: 140, ry: 230 }, 'Keep the same cube and viewing angle');
  assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 3, total: 3 }));
  assert.deepEqual(get('coach-move-track').children.map(n => n.className), ['done', 'done', 'on']);
  assert.equal(get('coach-goal').textContent, LANG.t('coach.done.title'));
  assert.equal(get('done-count').textContent, LANG.t('coach.done.count', { n: 2 }));
  assert.equal(get('done-count').hidden, false);
  assert.equal(get('coach-back').disabled, false);
  assert.equal(get('coach-next').hidden, true);
  assert.equal(get('done-again').hidden, false);
  assert.equal(get('coach-word').textContent, '');
  assert.equal(f.tasks.size, 0);

  f.replay();
  get('coach-next').onclick();
  for (const key of [' ', 'ArrowUp', 'ArrowDown', 'ArrowRight']) {
    f.listeners.keydown({ key, target: get('done-again'), preventDefault() { assert.fail('Preserve native keys on the done step'); } });
  }
  get('lang-switch').onclick();
  f.document.hidden = true;
  f.listeners.visibilitychange();
  f.document.hidden = false;
  f.listeners.visibilitychange();
  f.tick(15000);
  assert.equal(L.isSolved(coach.get()), true);
  assert.equal(get('coach-goal').textContent, LANG.t('coach.done.title'));
  assert.equal(f.tasks.size, 0, 'Done must never demonstrate an undefined move');

  let prevented = false;
  f.listeners.keydown({ key: 'ArrowLeft', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(coach.busy(), true);
  assert.equal(get('done-again').disabled, true);
  get('done-again').onclick();
  assert.equal(get('screen-coach').hidden, false, 'Do not leave while undoing the final turn');
  await f.settle();
  assert.deepEqual(coach.get(), L.applyMoves(initial, ['U']));
  assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 2, total: 3 }));
  assert.equal(get('done-count').hidden, true);
  assert.equal(get('done-again').hidden, true);
  assert.equal(get('coach-next').hidden, false);
  assert.equal(get('coach-cube').dataset.demoPhase, 'focus');

  await f.advance();
  assert.equal(L.isSolved(coach.get()), true);
  assert.equal(get('done-again').hidden, false);
  assert.equal(f.tasks.size, 0);
  get('done-again').onclick();
  assert.equal(f.window.location.href, 'index.html');
});

test('reduced motion keeps automatic previews static but a requested turn remains visible', async () => {
  const f = fixture({ app: true, reducedMotion: true, scramble: ['U'] });
  assert.equal(f.tasks.size, 0, 'Do not animate automatic previews');
  f.get('coach-next').onclick();
  await f.settle(800);
  assert.equal(f.coach.busy(), true, 'Next still demonstrates the requested rotation');
  assert.equal(f.get('done-again').hidden, true);
  assert.deepEqual(f.coach.get(), f.initial);
  await f.settle();
  assert.equal(f.get('done-again').hidden, false);
  assert.equal(L.isSolved(f.coach.get()), true);
  assert.equal(f.tasks.size, 0);
});

test('a hidden tab finishes a confirmed turn even when animation frames stop', async () => {
  const f = fixture({ app: true }), { get, coach, initial, moves } = f;
  f.pauseFrames();
  get('coach-next').onclick();
  f.document.hidden = true;
  f.listeners.visibilitychange();
  await f.settle();
  assert.equal(coach.busy(), false);
  assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, 1)));
  assert.equal(f.tasks.size, 0, 'Do not restart previews in a hidden tab');
  assert.equal(get('coach-next').disabled, false);
  f.document.hidden = false;
  f.listeners.visibilitychange();
  assert.equal(get('coach-cube').dataset.demoPhase, 'focus');
});

test('an already solved cube finishes without starting an empty demonstration', () => {
  const f = fixture({ app: true, solved: true });
  assert.equal(f.get('screen-coach').hidden, false);
  assert.equal(f.get('done-again').hidden, false);
  assert.equal(f.get('coach-progress').textContent, LANG.t('coach.progress', { current: 1, total: 1 }));
  assert.equal(f.get('coach-move-track').children.length, 1);
  assert.equal(f.get('coach-back').disabled, true);
  f.get('coach-back').onclick();
  f.get('coach-next').onclick();
  f.replay();
  assert.equal(f.tasks.size, 0);
  assert.equal(L.isSolved(f.coach.get()), true);
});

test('only confirmations advance; undo, replay, visibility, and finishing cancel previews', async () => {
  const f = fixture({ app: true }), { coach, initial, solution, moves, get } = f;
  assert.equal(solution.ok, true);
  f.tick(15000);
  assert.deepEqual(coach.get(), initial);
  assert.equal(get('coach-back').disabled, true);
  await f.advance();
  assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, 1)));
  await f.advance(-1);
  assert.deepEqual(coach.get(), initial);
  f.replay();
  get('lang-switch').onclick();
  assert.deepEqual(coach.get(), initial);
  assert.equal(get('coach-cube').dataset.demoPhase, 'focus');
  f.document.hidden = true;
  f.listeners.visibilitychange();
  assert.equal(f.tasks.size, 0);
  f.document.hidden = false;
  f.listeners.visibilitychange();
  assert.equal(get('coach-cube').dataset.demoPhase, 'focus');
  for (let i = 0; i < moves.length - 1; i++) await f.advance();
  f.tick(15000);
  assert.equal(get('screen-coach').hidden, false, 'The last turn also waits for confirmation');
  await f.advance();
  assert.equal(get('done-again').hidden, false);
  assert.equal(L.isSolved(coach.get()), true);
  assert.equal(f.tasks.size, 0);
  get('done-again').onclick();
  assert.equal(f.window.location.href, 'index.html');
  assert.equal(f.tasks.size, 0);
});

test('held Left/Right keys keep navigating and Space/Up/Down replay the same move', async () => {
  const f = fixture({ app: true }), { coach, initial, moves, get } = f;
  async function key(key, extra = {}) {
    const event = { key, target: get('coach-next'), preventDefault() { this.defaultPrevented = true; }, ...extra };
    f.listeners.keydown(event);
    if (key === 'ArrowLeft' || key === 'ArrowRight') await f.settle();
    return event;
  }
  assert.equal((await key('ArrowRight')).defaultPrevented, true);
  const afterOne = L.applyMoves(initial, moves.slice(0, 1));
  assert.deepEqual(coach.get(), afterOne);
  await key('ArrowRight', { repeat: true });
  const afterTwo = L.applyMoves(initial, moves.slice(0, 2));
  assert.deepEqual(coach.get(), afterTwo, 'Holding Right keeps advancing');
  for (const repeat of [' ', 'ArrowUp', 'ArrowDown']) {
    assert.equal((await key(repeat)).defaultPrevented, true);
    assert.equal(get('coach-cube').dataset.demoPhase, 'focus');
    assert.deepEqual(coach.get(), afterTwo);
    f.tick(1300);
    await key(repeat, { repeat: true });
    assert.equal(get('coach-cube').dataset.demoPhase, 'turn', 'Holding replay must let the animation continue');
  }
  assert.equal((await key('ArrowLeft')).defaultPrevented, true);
  assert.deepEqual(coach.get(), afterOne);
  await key('ArrowLeft', { repeat: true });
  assert.deepEqual(coach.get(), initial, 'Holding Left keeps going backward');
  await key('ArrowLeft', { repeat: true });
  assert.deepEqual(coach.get(), initial);
  await key('ArrowLeft');
  assert.deepEqual(coach.get(), initial, 'Back stops at the first move');
});

test('shortcuts leave editing, modified keys, and other screens alone', async () => {
  const f = fixture({ app: true }), { coach, initial, get } = f;
  const ignored = [
    { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true },
    { isComposing: true }, { defaultPrevented: true },
    { target: { isContentEditable: true } },
    { target: { closest: () => ({}) } }
  ];
  for (const extra of ignored) {
    f.listeners.keydown({ key: 'ArrowRight', preventDefault() { assert.fail('Native key handling should be preserved'); }, ...extra });
    assert.deepEqual(coach.get(), initial);
  }
  for (let i = 0; i < f.moves.length; i++) await f.advance();
  assert.equal(get('done-again').hidden, false);
  get('done-again').onclick();
  f.listeners.keydown({ key: ' ', preventDefault() { assert.fail('Shortcuts only apply to the lesson'); } });
  assert.equal(f.window.location.href, 'index.html');
  assert.equal(f.tasks.size, 0);
});

test('a double turn becomes two numbered, separately confirmed quarter turns', async () => {
  const f = fixture({ app: true, scramble: ['U2'] }), { coach, initial, get } = f;
  assert.deepEqual(f.solution.moves, ['U2']);
  const track = get('coach-move-track');
  assert.deepEqual(track.children.map(n => n.textContent), [1, 2, 3]);
  assert.equal(track.children[0].className, 'on');
  assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 1, total: 3 }));
  assert.equal(f.pendingMove, 'U');
  f.tick(1800);
  assert.equal(get('coach-cube').dataset.demoPhase, 'hold');
  const cubies = get('coach-cube').children[0].children.filter(el => el.className === 'cubie');
  assert.equal(cubies.filter(el => el.style.transform.startsWith('rotateY(-90deg)')).length, 9);
  await f.advance();
  assert.deepEqual(coach.get(), L.applyMoves(initial, ['U']), 'The halfway state must be a real step');
  assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 2, total: 3 }));
  assert.equal(track.children[0].className, 'done');
  assert.equal(track.children[1].className, 'on');
  assert.equal(f.pendingMove, 'U', 'The repeated action keeps the same direction');
  f.replay();
  f.tick(10000);
  assert.equal(track.children[1].className, 'on', 'Repeats keep the same step number');
  await f.advance(-1);
  assert.deepEqual(coach.get(), initial);
  assert.equal(track.children[0].className, 'on');
  await f.advance();
  assert.equal(get('screen-coach').hidden, false);
  await f.advance();
  assert.equal(get('done-again').hidden, false);
  assert.equal(L.isSolved(coach.get()), true);
  assert.equal(get('done-count').textContent, LANG.t('coach.done.count', { n: 2 }));
});

test('every numbered action is a quarter turn and the count covers the whole solve', async () => {
  const f = fixture({ app: true }), { coach, initial, moves, get } = f;
  assert.equal(get('coach-move-track').children.length, moves.length + 1);
  for (let i = 0; i < moves.length; i++) {
    assert.match(f.pendingMove, /^[URFDLB]'?$/);
    assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: i + 1, total: moves.length + 1 }));
    assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, i)));
    await f.advance();
  }
  assert.equal(L.isSolved(coach.get()), true);
  assert.equal(get('done-again').hidden, false);
});

test('scanned progress starts the coach at the remaining work on the child\'s own colour', async () => {
  const cases = [
    { alg: 'cornerInsert', completed: 1 }, { alg: 'beltRight', completed: 2 },
    { alg: 'yellowCross', completed: 3 }, { alg: 'sune', completed: 4 },
    { alg: 'cornerCycle', completed: 5 }, { alg: 'edgeCycle', completed: 6 }
  ];
  for (const { alg, completed } of cases) {
    const scramble = L.inverse(L.ALGS[alg]);
    const scanned = L.applyMoves(L.solvedState(), scramble);
    const f = fixture({ app: true, scramble }), { coach, get } = f;
    assert.deepEqual(f.initial, scanned, 'Keep the yellow starting layer instead of rebuilding white');
    assert.deepEqual(coach.get(), scanned, 'The first demonstration starts at the scanned cube');
    assert.ok(f.solution.stages.slice(0, completed).every(s => s.moves.length === 0));
    assert.equal(get('coach-move-track').children.length, f.moves.length + 1);
    assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 1, total: f.moves.length + 1 }));
    for (let i = 0; i < f.moves.length; i++) await f.advance();
    assert.equal(L.isSolved(coach.get()), true);
    assert.equal(get('done-again').hidden, false);
  }
});

test('the short goal follows each phase through numbered quarter turns', async () => {
  const f = fixture({ app: true, scramble: L.parse('R U F L D B') }), { get } = f;
  const colours = { base: LANG.colour(f.faceColours[L.FACE_INDEX.D]), top: LANG.colour(f.faceColours[L.FACE_INDEX.U]) };
  for (const stage of f.solution.stages) for (const move of stage.moves) {
    for (let quarter = 0; quarter < (move.endsWith('2') ? 2 : 1); quarter++) {
      assert.equal(get('coach-goal').textContent, LANG.t('coach.target.' + stage.key, colours));
      await f.advance();
    }
  }
  assert.equal(get('done-again').hidden, false);
});

test('the goal uses the child\'s orange starting layer and survives replay and back', async () => {
  const map = L.rotateFaces(L.FACE_ORDER, 'z');
  const scramble = L.inverse(L.ALGS.cornerInsert).concat(['U'])
    .map(m => L.FACE_ORDER[map.indexOf(m[0])] + m.slice(1));
  const f = fixture({ app: true, scramble }), { get } = f;
  assert.equal(f.faceColours[L.FACE_INDEX.D], 'orange');
  const expected = LANG.t('coach.target.corners', { base: LANG.colour('orange') });
  assert.equal(get('coach-goal').textContent, expected);
  f.replay();
  assert.equal(get('coach-goal').textContent, expected);
  await f.advance();
  await f.advance(-1);
  assert.equal(get('coach-goal').textContent, expected);
});

test('selecting any step reconstructs its cube, goal, and completion state in either direction', () => {
  const f = fixture({ app: true, scramble: L.parse('R U F L D B') }), { get, coach, initial, moves } = f;
  const track = get('coach-move-track');
  const targets = f.solution.stages.flatMap(stage => stage.moves.flatMap(move =>
    Array(move.endsWith('2') ? 2 : 1).fill(stage.key)));
  for (const index of [moves.length - 1, 0, Math.floor(moves.length / 2), moves.length, 1, moves.length]) {
    track.children[index].onclick({ detail: 1 });
    assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, index)));
    assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: index + 1, total: moves.length + 1 }));
    assert.equal(track.children[index].getAttribute('aria-current'), 'step');
    assert.equal(track.children[index].tabIndex, 0);
    assert.equal(track.children.filter(button => button.tabIndex === 0).length, 1);
    assert.equal(track.children.filter(button => button.getAttribute('aria-current') === 'step').length, 1);
    assert.equal(get('done-again').hidden, index !== moves.length);
    if (index === moves.length) {
      assert.equal(L.isSolved(coach.get()), true);
      assert.equal(f.tasks.size, 0);
    } else {
      assert.equal(f.pendingMove, moves[index]);
      assert.equal(get('coach-goal').textContent, LANG.t('coach.target.' + targets[index], {
        base: LANG.colour(f.faceColours[L.FACE_INDEX.D]), top: LANG.colour(f.faceColours[L.FACE_INDEX.U])
      }));
    }
  }
});

test('left mouse, right mouse, and touch drags scroll the step row without changing the step or activating a release click', () => {
  for (const [pointerType, button] of [['mouse', 0], ['mouse', 2], ['touch', 0]]) {
    const f = fixture({ app: true }), { get, coach, initial } = f;
    const track = get('coach-move-track'), angles = { ...coach.angles() };
    const event = (x, extra = {}) => ({ pointerType, pointerId: 1, button, clientX: x,
      stopPropagation() { this.stopped = true; }, preventDefault() {}, ...extra });
    track.scrollLeft = 200;
    const down = event(250);
    track.emit('pointerdown', down);
    assert.equal(down.stopped, true, 'The cube mat must not receive the drag');
    track.emit('pointermove', event(150));
    assert.equal(track.scrollLeft, 300);
    assert.equal(track.classList.contains('is-dragging'), true);
    track.emit('pointermove', event(300));
    assert.equal(track.scrollLeft, 150);
    track.emit('pointerup', event(300));
    assert.equal(track.classList.contains('is-dragging'), false);
    track.children[2].onclick({ detail: 1 });
    assert.deepEqual(coach.get(), initial, 'A release after dragging must not jump');
    assert.deepEqual({ ...coach.angles() }, angles);
    track.emit('pointerdown', event(300, { button: 0 }));
    track.emit('pointermove', event(302));
    track.emit('pointerup', event(302));
    track.children[2].onclick({ detail: 1 });
    assert.deepEqual(coach.get(), L.applyMoves(initial, f.moves.slice(0, 2)), 'A new tap still selects a step');
    track.emit('pointerdown', event(250));
    track.emit('pointermove', event(150));
    track.emit('pointercancel', event(150));
    assert.equal(track.classList.contains('is-dragging'), false);
    assert.equal(track.capturedPointer, null);
    const menu = { preventDefault() { this.prevented = true; }, stopPropagation() {} };
    track.emit('contextmenu', menu);
    assert.equal(menu.prevented, true);
  }
});

test('step buttons support arrow keys, Home, End, and native Space without triggering coach shortcuts', () => {
  const f = fixture({ app: true }), { get, coach, initial, moves } = f;
  const track = get('coach-move-track');
  function key(name, index) {
    const event = { key: name, target: track.children[index],
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    track.emit('keydown', event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
  }
  key('ArrowRight', 0);
  assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, 1)));
  assert.equal(f.document.activeElement, track.children[1]);
  key('End', 1);
  assert.equal(L.isSolved(coach.get()), true);
  key('ArrowLeft', moves.length);
  assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, -1)));
  key('Home', moves.length - 1);
  assert.deepEqual(coach.get(), initial);
  f.listeners.keydown({ key: ' ', target: track.children[2], preventDefault() { assert.fail('Leave native button activation available'); } });
  track.children[2].onclick({ detail: 0 });
  assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, 2)));
});

test('step selection waits for a confirmed turn to finish and ignores the hidden coach', async () => {
  const f = fixture({ app: true }), { get, coach, initial, moves } = f;
  const track = get('coach-move-track');
  get('coach-next').onclick();
  assert.ok(track.children.every(button => button.disabled));
  track.children[5].onclick({ detail: 1 });
  assert.deepEqual(coach.get(), initial);
  await f.settle();
  assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, 1)));
  assert.ok(track.children.every(button => !button.disabled));
  track.children[moves.length].onclick({ detail: 1 });
  get('done-again').onclick();
  track.children[0].onclick({ detail: 1 });
  assert.equal(get('screen-coach').hidden, true);
  assert.equal(L.isSolved(coach.get()), true);
});

test('corner resizing works with mouse and touch, keeps cube orientation, and clamps to the window', () => {
  for (const pointerType of ['mouse', 'touch']) {
    const f = fixture({ app: true }), { get, coach, initial } = f;
    const panel = get('coach-panel'), section = get('screen-coach'), handle = get('coach-resize');
    panel.getBoundingClientRect = () => ({ left: 16, width: parseFloat(section.style.width) || 728, height: parseFloat(panel.style.height) || 454 });
    const angles = { ...coach.angles() };
    const event = (x, y) => ({ pointerType, pointerId: 1, button: 0, clientX: x, clientY: y,
      stopPropagation() { this.stopped = true; }, preventDefault() {} });
    const down = event(740, 450);
    handle.emit('pointerdown', down);
    assert.equal(down.stopped, true, 'The resize handle must not start a cube drag');
    handle.emit('pointermove', event(790, 525));
    assert.equal(section.style.width, '828px');
    assert.equal(panel.style.height, '604px');
    assert.ok(Number(panel.style['--coach-scale']) > 1, 'Scale step buttons, notes, and spacing with the panel');
    assert.equal(f.document.body.classList.contains('is-coaching'), true);
    assert.deepEqual(coach.get(), initial);
    assert.deepEqual({ ...coach.angles() }, angles);
    handle.emit('pointerup', event(790, 525));
    assert.equal(panel.classList.contains('is-resizing'), false);
    assert.equal(handle.capturedPointer, null);
    get('coach-move-track').children[5].onclick({ detail: 0 });
    assert.equal(panel.style.height, '604px', 'Keep the chosen size when changing steps');
    handle.emit('pointerdown', event(790, 525));
    handle.emit('pointermove', event(-1000, -1000));
    assert.equal(section.style.width, '320px');
    assert.equal(panel.style.height, '360px');
    handle.emit('pointermove', event(10000, 10000));
    assert.equal(section.style.width, '1168px');
    assert.equal(panel.style.height, '620px');
    handle.emit('pointercancel', event(10000, 10000));
    assert.equal(panel.classList.contains('is-resizing'), false);
    f.document.documentElement.clientWidth = 500;
    f.windowListeners.resize.forEach(fn => fn());
    assert.equal(section.style.width, '468px', 'Shrink the panel when the browser gets narrower');
  }
});

test('the resize handle supports arrow keys without navigating lesson steps', () => {
  const f = fixture({ app: true }), { get, coach, initial } = f;
  const handle = get('coach-resize'), panel = get('coach-panel'), section = get('screen-coach');
  panel.getBoundingClientRect = () => ({ left: 16, width: parseFloat(section.style.width) || 728, height: parseFloat(panel.style.height) || 454 });
  const key = (name, extra = {}) => ({ key: name, target: handle, preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; }, ...extra });
  const down = key('ArrowDown');
  handle.emit('keydown', down);
  assert.equal(down.defaultPrevented, true);
  assert.equal(down.stopped, true);
  assert.equal(panel.style.height, '474px');
  handle.emit('keydown', key('ArrowRight', { shiftKey: true }));
  assert.equal(section.style.width, '778px');
  f.listeners.keydown(key('ArrowRight'));
  f.listeners.keydown(key(' '));
  assert.equal(coach.busy(), false);
  assert.deepEqual(coach.get(), initial);
  assert.equal(handle.getAttribute('aria-label'), LANG.t('coach.resize'));
});

test('resizing the cube stage scales the cube and arrows together without resetting the current preview', () => {
  const f = fixture({ app: true }), host = f.get('coach-cube'), cube = host.children[0];
  const observer = f.resizeObservers.find(o => o.host === host);
  f.tick(1300);
  const initial = f.coach.get(), angles = { ...f.coach.angles() };
  const transforms = cube.children.map(el => el.style.transform);
  host.clientWidth = 800;
  host.clientHeight = 600;
  observer.callback();
  assert.equal(cube.style.scale, 600 / 230, 'The larger stage must allow a larger cube');
  assert.deepEqual(cube.children.map(el => el.style.transform), transforms, 'Arrows and cubies retain their shared transforms');
  assert.deepEqual(f.coach.get(), initial);
  assert.deepEqual({ ...f.coach.angles() }, angles);
  host.clientWidth = 250;
  observer.callback();
  assert.equal(cube.style.scale, 250 / 230, 'Fit within the shorter stage dimension');
});

test('every selected step survives reload and shared URLs restore the exact lesson without solving again', async () => {
  const f = fixture({ app: true, persistence: true, scramble: L.parse('R U F L D B') });
  const track = f.get('coach-move-track'), total = f.moves.length;
  for (const index of [1, Math.floor(total / 2), total, total - 1, 0]) {
    track.children[index].onclick({ detail: 0 });
    const hash = f.window.location.hash;
    assert.equal(f.storage.get(P.STORE), hash);
    assert.equal(P.decode(hash).session.cursor, index);
    const shared = fixture({ app: true, persistence: true, hash, autoSolve: false });
    const reloaded = fixture({ app: true, persistence: true, hash, storage: new Map(f.storage), autoSolve: false });
    for (const restored of [shared, reloaded]) {
      assert.equal(restored.get('screen-coach').hidden, false);
      assert.equal(restored.solution, undefined, 'Saved moves must survive future solver changes');
      assert.deepEqual(restored.coach.get(), L.applyMoves(f.initial, f.moves.slice(0, index)));
      assert.equal(restored.get('coach-progress').textContent, LANG.t('coach.progress', { current: index + 1, total: total + 1 }));
      assert.equal(restored.get('coach-goal').textContent, f.get('coach-goal').textContent);
      assert.equal(restored.get('done-again').hidden, index !== total);
    }
  }
  assert.ok(f.replacements.length > 0);
  assert.equal(f.window.location.pathname, '/cube/solve.html');
});

test('confirmations and undo are saved before their animations finish', async () => {
  const f = fixture({ app: true, persistence: true, scramble: ['U2'] });
  f.get('coach-next').onclick();
  const next = fixture({ app: true, persistence: true, hash: f.window.location.hash, storage: new Map(f.storage), autoSolve: false });
  assert.deepEqual(next.coach.get(), L.applyMoves(f.initial, ['U']));
  assert.equal(P.decode(next.window.location.hash).session.cursor, 1);
  await f.settle();
  const stable = f.window.location.hash;
  f.tick(15000);
  assert.equal(f.window.location.hash, stable, 'Repeating previews must not advance saved progress');
  f.get('coach-back').onclick();
  const back = fixture({ app: true, persistence: true, hash: f.window.location.hash, storage: new Map(f.storage), autoSolve: false });
  assert.deepEqual(back.coach.get(), f.initial);
  assert.equal(P.decode(back.window.location.hash).session.cursor, 0);
});

test('painting and clearing capture colours update both the URL and local storage immediately', () => {
  const f = fixture({ app: true, persistence: true, autoSolve: false });
  assert.equal(f.get('screen-capture').hidden, false);
  f.paint(0, 'red'); f.paint(4, 'white'); f.paint(18, 'blue');
  const hash = f.window.location.hash, saved = P.decode(hash);
  assert.equal(saved.view, 'capture');
  assert.equal(saved.names[0], 'red'); assert.equal(saved.names[18], 'blue');
  assert.equal(saved.names[1], null);
  assert.equal(f.storage.get(P.STORE), hash);
  for (const config of [{ hash }, { hash, storage: new Map(f.storage) }]) {
    const restored = fixture({ app: true, persistence: true, autoSolve: false, ...config });
    assert.equal(restored.get('screen-capture').hidden, false);
    assert.deepEqual(P.decode(restored.window.location.hash).names, saved.names);
  }
  f.get('cap-clear').onclick();
  assert.ok(P.decode(f.window.location.hash).names.every(name => name === null));
  assert.ok(P.decode(f.storage.get(P.STORE)).names.every(name => name === null));
});

test('manual colour edits are shared and restored in the manual editor', () => {
  const centres = Array(54).fill(null);
  ['white', 'red', 'green', 'yellow', 'orange', 'blue'].forEach((colour, face) => { centres[face * 9 + 4] = colour; });
  const f = fixture({ app: true, persistence: true, autoSolve: false, hash: P.encode({ view: 'check', names: centres }) });
  f.get('net-palette').children.find(button => button.title === 'orange').onclick();
  f.get('net').children[0].children[1].children[0].onclick();
  const saved = P.decode(f.window.location.hash);
  assert.equal(saved.view, 'check');
  assert.equal(saved.names[0], 'orange');
  assert.equal(saved.names[4], 'white');
  const restored = fixture({ app: true, persistence: true, hash: f.window.location.hash, autoSolve: false });
  assert.equal(restored.get('screen-check').hidden, false);
  assert.deepEqual(P.decode(restored.window.location.hash).names, saved.names);
});

test('a shared link wins over local progress, and damaged links do not overwrite the local lesson', () => {
  const first = fixture({ app: true, persistence: true, scramble: ['U2'] });
  first.get('coach-move-track').children[1].onclick({ detail: 0 });
  const other = fixture({ app: true, persistence: true, scramble: L.parse('R U F') });
  const storage = new Map(other.storage), hash = first.window.location.hash;
  const shared = fixture({ app: true, persistence: true, storage, hash, autoSolve: false });
  assert.deepEqual(shared.coach.get(), first.coach.get());
  assert.equal(storage.get(P.STORE), hash);
  const broken = '#v=1&cube=broken&view=coach&step=200';
  const invalid = fixture({ app: true, persistence: true, storage, hash: broken, autoSolve: false });
  assert.equal(invalid.get('progress-error').hidden, false);
  assert.deepEqual(invalid.coach.get(), first.coach.get(), 'A damaged link carries on with the saved lesson');
  assert.equal(storage.get(P.STORE), hash, 'and leaves it exactly as it was');
});

test('valid progress links still work with blocked storage, and local saving survives a blocked History API', () => {
  const f = fixture({ app: true, persistence: true, storageBlocked: true, scramble: ['U2'] });
  f.get('coach-move-track').children[1].onclick({ detail: 0 });
  const restored = fixture({ app: true, persistence: true, storageBlocked: true, hash: f.window.location.hash, autoSolve: false });
  assert.deepEqual(restored.coach.get(), f.coach.get());
  const noHistory = fixture({ app: true, persistence: true, autoSolve: false, scramble: ['U2'], search: '?autofill=random' });
  noHistory.window.history.replaceState = () => { throw new Error('History blocked'); };
  noHistory.get('cap-solve').onclick();
  assert.equal(P.decode(noHistory.storage.get(P.STORE)).view, 'coach');
});

test('a fresh start empties the cube, and corrupt local progress does not break startup', () => {
  const names = Array(54).fill(null); names[4] = 'yellow'; names[9] = 'orange';
  const storage = new Map([['cube-coach/cube2', JSON.stringify({ names })], [P.STORE, '{invalid}']]);
  const fresh = fixture({ app: true, persistence: true, storage, autoSolve: false, search: '?fresh=1' });
  assert.equal(fresh.get('screen-capture').hidden, false);
  assert.equal(fresh.get('cap-msg').hidden, true, 'Do not show a previous-cube notice');
  assert.ok(P.decode(storage.get(P.STORE)).names.every(name => name === null));
  assert.ok(JSON.parse(storage.get('cube-coach/cube2')).names.every(name => name === null));
  assert.equal(fresh.solution, undefined, 'Starting over must not solve an old cube');
  const broken = fixture({ app: true, persistence: true, storage: new Map([[P.STORE, 'broken']]), autoSolve: false });
  assert.equal(broken.get('screen-capture').hidden, false);
  const kept = fixture({ app: true, persistence: true, autoSolve: false,
    storage: new Map([['cube-coach/cube2', JSON.stringify({ names })]]) });
  assert.equal(P.decode(kept.window.location.hash).names[4], 'yellow', 'A plain visit keeps the cube left here');
});

test('opening another progress fragment during an animation waits safely and replaces the old lesson', async () => {
  const f = fixture({ app: true, persistence: true, scramble: L.parse('R U F') });
  const incoming = fixture({ app: true, persistence: true, scramble: ['U2'] });
  incoming.get('coach-move-track').children[1].onclick({ detail: 0 });
  f.get('coach-next').onclick();
  f.window.location.hash = incoming.window.location.hash;
  f.windowListeners.hashchange.forEach(fn => fn());
  assert.equal(f.coach.busy(), true);
  await f.settle();
  assert.deepEqual(f.coach.get(), incoming.coach.get());
  assert.equal(f.get('coach-progress').textContent, incoming.get('coach-progress').textContent);
  assert.equal(f.storage.get(P.STORE), incoming.window.location.hash);
});

test('autofill generates a new cube and saves a URL that restores it instead of generating again', () => {
  const saved = fixture({ app: true, persistence: true, scramble: ['U2'] });
  const storage = new Map(saved.storage), before = storage.get(P.STORE);
  const f = fixture({ app: true, persistence: true, autoSolve: false, storage,
    search: '?autofill=random', scramble: ['R'] });
  const hash = f.window.location.hash, progress = P.decode(hash);
  assert.equal(progress.view, 'capture');
  assert.equal(f.window.location.search, '', 'Consume the generate-once parameter');
  assert.equal(storage.get(P.STORE), hash);
  assert.notEqual(hash, before);
  const expected = Array.from(L.applyMoves(L.solvedState(), ['R']), face => ['white', 'red', 'green', 'yellow', 'orange', 'blue'][face]);
  assert.deepEqual(progress.names, expected);
  assert.deepEqual(JSON.parse(storage.get('cube-coach/cube2')).names, expected);
  for (const config of [{ hash }, { hash, storage }]) {
    const restored = fixture({ app: true, persistence: true, autoSolve: false, scramble: ['F'], ...config });
    assert.equal(restored.get('screen-capture').hidden, false);
    assert.equal(restored.window.location.hash, hash);
    assert.deepEqual(P.decode(restored.window.location.hash).names, expected);
  }
});

test('a new autofill request replaces old fragments with its own state and preserves unrelated query parameters', () => {
  const saved = fixture({ app: true, persistence: true, scramble: ['U2'] });
  const partial = P.encode({ view: 'capture', names: Array(54).fill(null) });
  const expected = L.applyMoves(L.solvedState(), ['R']);
  const colours = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];
  for (const hash of [saved.window.location.hash, partial, '#v=1&cube=broken']) {
    const storage = new Map(saved.storage);
    const f = fixture({ app: true, persistence: true, autoSolve: false, storage,
      search: '?autofill=random&example=kept', hash, scramble: ['R'] });
    assert.equal(f.get('screen-capture').hidden, false);
    assert.equal(f.get('progress-error').hidden, true);
    assert.equal(P.decode(f.window.location.hash).view, 'capture');
    assert.equal(f.window.location.search, '?example=kept');
    const stickers = f.get('cap-cube').children[0].children
      .filter(el => el.className === 'cubie').flatMap(el => el.children)
      .filter(el => el.dataset.facelet != null);
    assert.equal(stickers.length, 54);
    for (const sticker of stickers) {
      assert.equal(sticker.style.background, f.window.CubeView.HEX[colours[expected[sticker.dataset.facelet]]]);
    }
    assert.equal(storage.get(P.STORE), f.window.location.hash);
    f.window.location.hash = saved.window.location.hash;
    f.windowListeners.hashchange.forEach(fn => fn());
    assert.equal(f.get('screen-coach').hidden, false, 'After generation, shared-state navigation works normally');
    assert.deepEqual(f.coach.get(), saved.coach.get());
  }
});

test('an autofilled lesson can be solved, advanced, refreshed, and shared at the same step', async () => {
  const f = fixture({ app: true, persistence: true, autoSolve: false, search: '?autofill=random', scramble: ['U2'] });
  f.get('cap-solve').onclick();
  await f.advance();
  assert.equal(P.decode(f.window.location.hash).session.cursor, 1);
  for (const config of [{ hash: f.window.location.hash }, { hash: f.window.location.hash, storage: new Map(f.storage) }]) {
    const restored = fixture({ app: true, persistence: true, autoSolve: false, scramble: ['F'], ...config });
    assert.equal(restored.solution, undefined, 'Restore the saved lesson without generating or solving another cube');
    assert.deepEqual(restored.coach.get(), f.coach.get());
    assert.equal(restored.get('coach-progress').textContent, f.get('coach-progress').textContent);
  }
  await f.advance();
  const completed = fixture({ app: true, persistence: true, autoSolve: false, hash: f.window.location.hash });
  assert.equal(completed.get('done-again').hidden, false);
  assert.equal(L.isSolved(completed.coach.get()), true);
});

test('clearing an autofilled cube stays cleared after reload, while a new autofill URL generates again', () => {
  const f = fixture({ app: true, persistence: true, autoSolve: false, search: '?autofill=random', scramble: ['R'] });
  f.get('cap-clear').onclick();
  const restored = fixture({ app: true, persistence: true, autoSolve: false, hash: f.window.location.hash });
  assert.ok(P.decode(restored.window.location.hash).names.every(name => name === null));
  const fresh = fixture({ app: true, persistence: true, autoSolve: false, storage: f.storage,
    search: '?autofill=random', scramble: ['F'] });
  assert.ok(P.decode(fresh.window.location.hash).names.every(Boolean));
  assert.notEqual(fresh.window.location.hash, f.window.location.hash);
});

test('autofill still produces a shareable URL when local storage is unavailable', () => {
  const f = fixture({ app: true, persistence: true, autoSolve: false, storageBlocked: true,
    search: '?autofill=random', scramble: ['R'] });
  assert.equal(f.window.location.search, '');
  assert.equal(P.decode(f.window.location.hash).view, 'capture');
  const shared = fixture({ app: true, persistence: true, autoSolve: false, hash: f.window.location.hash });
  assert.equal(shared.window.location.hash, f.window.location.hash);
});

test('version 1 and 2 progress URLs migrate to compressed URLs while keeping the cube and step', () => {
  const f = fixture({ app: true, persistence: true, scramble: ['U2'] });
  f.get('coach-move-track').children[1].onclick({ detail: 0 });
  const current = P.decode(f.window.location.hash), s = current.session;
  const keys = ['cross', 'corners', 'belt', 'yellowCross', 'yellowFace', 'cornerPlace', 'lastEdges'];
  const params = new URLSearchParams({ v: '1', view: 'coach', cube: current.names.map(c => c[0]).join(''),
    step: s.cursor + 1, turns: s.moves.map(m => m.length === 1 ? m : m[0].toLowerCase()).join(''),
    goals: s.targets.map(key => keys.indexOf(key)).join('') });
  const old = '#' + params;
  const packed = '#p=2.iSSSTtrbbZI222kkkkrbtts25JJAAQAgoUCi6g';
  for (const config of [{ hash: old }, { hash: old, storage: new Map([[P.STORE, old]]) },
    { hash: packed }, { hash: packed, storage: new Map([[P.STORE, packed]]) }]) {
    const restored = fixture({ app: true, persistence: true, autoSolve: false, ...config });
    assert.match(restored.window.location.hash, /^#p=3\./);
    assert.deepEqual(restored.coach.get(), f.coach.get());
    assert.equal(restored.get('coach-progress').textContent, f.get('coach-progress').textContent);
    assert.equal(restored.storage.get(P.STORE), restored.window.location.hash);
  }
  const storage = new Map(f.storage);
  const invalid = fixture({ app: true, persistence: true, storage, hash: '#p=3.invalid', autoSolve: false });
  assert.equal(invalid.get('progress-error').hidden, false);
  assert.equal(storage.get(P.STORE), f.window.location.hash);
});

test('one share click copies the current URL, shows confirmation, and dismisses after four seconds', async () => {
  const f = fixture({ app: true, persistence: true, scramble: ['U2'] }), copied = [];
  f.window.navigator = { clipboard: { async writeText(url) { copied.push(url); } } };
  f.get('coach-move-track').children[1].onclick({ detail: 0 });
  f.get('share-progress').focus();
  await f.get('share-progress').onclick();
  assert.deepEqual(copied, ['https://example.test/cube/solve.html' + f.window.location.hash]);
  assert.equal(P.decode(new URL(copied[0]).hash).session.cursor, 1);
  assert.equal(f.get('share-popover').hidden, false);
  assert.equal(f.get('share-url').value, copied[0]);
  assert.equal(f.get('share-progress').getAttribute('aria-expanded'), 'true');
  assert.equal(f.get('share-status').textContent, LANG.t('share.copied'));
  assert.equal(f.get('share-copied').hidden, false);
  assert.equal(f.get('share-failed').hidden, true);
  assert.equal(f.document.activeElement, f.get('share-progress'));
  f.tick(3999);
  assert.equal(f.get('share-popover').hidden, false);
  f.tick(1);
  assert.equal(f.get('share-popover').hidden, true);
  assert.equal(f.get('share-progress').getAttribute('aria-expanded'), 'false');
});

test('sharing works for entered colours and Done, and is hidden before a cube is started', async () => {
  const f = fixture({ app: true, persistence: true, autoSolve: false }), copied = [];
  f.window.navigator = { clipboard: { async writeText(url) { copied.push(url); } } };
  assert.equal(f.get('share-tools').hidden, false);
  await f.get('share-progress').onclick();
  assert.equal(P.decode(new URL(copied.at(-1)).hash).view, 'capture');
  f.get('net-redo').onclick();
  assert.equal(f.get('share-popover').hidden, true);
  f.paint(0, 'red');
  await f.get('share-progress').onclick();
  assert.equal(P.decode(new URL(copied.at(-1)).hash).names[0], 'red');
  const done = fixture({ app: true, persistence: true, scramble: ['U2'] });
  done.window.navigator = f.window.navigator;
  done.get('coach-move-track').children[done.moves.length].onclick({ detail: 0 });
  await done.get('share-progress').onclick();
  const saved = P.decode(new URL(copied.at(-1)).hash);
  assert.equal(saved.session.cursor, saved.session.moves.length);
});

test('sharing a turn in flight preserves its saved step even with unavailable History API and storage', async () => {
  const f = fixture({ app: true, persistence: true, storageBlocked: true, scramble: ['U2'] }), copied = [];
  f.window.navigator = { clipboard: { async writeText(url) { copied.push(url); } } };
  f.window.history.replaceState = () => { throw new Error('History is blocked'); };
  f.get('coach-next').onclick();
  await f.get('share-progress').onclick();
  const saved = P.decode(new URL(copied[0]).hash);
  assert.equal(saved.session.cursor, 1);
  assert.equal(P.decode(f.window.location.hash).session.cursor, 0);
  await f.settle();
  assert.equal(P.decode(new URL(copied[0]).hash).session.cursor, 1);
});

test('clipboard fallback copies the selected URL and a blocked copy never shows a success checkmark', async () => {
  for (const available of [true, false]) {
    const f = fixture({ app: true, persistence: true, scramble: ['U2'] });
    if (available) f.window.navigator = { clipboard: { writeText: () => Promise.reject(new Error('Denied')) } };
    let attempts = 0;
    f.document.execCommand = command => {
      attempts++; assert.equal(command, 'copy');
      assert.equal(f.get('share-url').selected, true);
      assert.match(f.get('share-url').value, /^https:\/\/example.test\/cube\/solve.html#p=/);
      return true;
    };
    f.get('share-progress').focus();
    await f.get('share-progress').onclick();
    assert.equal(attempts, 1);
    assert.equal(f.get('share-copied').hidden, false);
    assert.equal(f.document.activeElement, f.get('share-progress'));
    f.document.execCommand = () => false;
    await f.get('share-progress').onclick();
    assert.equal(f.get('share-copied').hidden, true);
    assert.equal(f.get('share-failed').hidden, false);
    assert.equal(f.get('share-status').textContent, LANG.t('share.failed'));
    assert.equal(f.get('share-popover').hidden, false);
    f.tick(8000);
    assert.equal(f.get('share-popover').hidden, true);
  }
});

test('repeated share clicks refresh the timer and stale clipboard replies cannot reopen a dismissed popover', async () => {
  const f = fixture({ app: true, persistence: true, scramble: ['U2'] }), pending = [];
  f.window.navigator = { clipboard: { writeText: () => new Promise(resolve => pending.push(resolve)) } };
  const first = f.get('share-progress').onclick();
  f.tick(3000);
  const second = f.get('share-progress').onclick();
  pending[0](); await first;
  assert.equal(f.get('share-status').textContent, LANG.t('share.copying'));
  pending[1](); await second;
  f.tick(3999);
  assert.equal(f.get('share-popover').hidden, false);
  f.tick(1);
  assert.equal(f.get('share-popover').hidden, true);
  const third = f.get('share-progress').onclick();
  f.listeners.pointerdown({ target: f.get('share-tools') });
  assert.equal(f.get('share-popover').hidden, false);
  f.listeners.pointerdown({ target: f.get('coach-cube') });
  pending[2](); await third;
  assert.equal(f.get('share-popover').hidden, true);
  const fourth = f.get('share-progress').onclick();
  f.tick(4000); pending[3](); await fourth;
  assert.equal(f.get('share-popover').hidden, true, 'A stalled Clipboard API must not keep the popover open');
});

test('sharing preserves native keyboard activation, and Escape closes the popover without changing steps', async () => {
  const f = fixture({ app: true, persistence: true, scramble: ['U2'] });
  f.window.navigator = { clipboard: { async writeText() {} } };
  const hash = f.window.location.hash;
  f.listeners.keydown({ key: ' ', target: f.get('share-progress'), preventDefault() { assert.fail('Allow native Share activation'); } });
  await f.get('share-progress').onclick();
  f.listeners.keydown({ key: 'ArrowLeft', target: f.get('share-url'), preventDefault() { assert.fail('Allow URL selection'); } });
  let prevented = false;
  f.listeners.keydown({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(f.get('share-popover').hidden, true);
  assert.equal(f.document.activeElement, f.get('share-progress'));
  assert.equal(f.window.location.hash, hash);
});

test('coming back to the page carries on with whatever was saved, in any view', () => {
  const prior = fixture({ app: true, persistence: true, scramble: ['U2'] });
  prior.get('coach-move-track').children[1].onclick({ detail: 0 });
  const names = Array(54).fill(null); names[4] = 'white'; names[18] = 'green';
  const views = [[prior.window.location.hash, 'coach'], [P.encode({ view: 'capture', names }), 'capture'],
    [P.encode({ view: 'check', names }), 'check']];
  for (const [hash, view] of views) {
    const storage = new Map([[P.STORE, hash], ['cube-coach/cube2', JSON.stringify({ names })]]);
    const f = fixture({ app: true, persistence: true, autoSolve: false, storage });
    assert.equal(f.get('screen-' + view).hidden, false);
    assert.equal(storage.get(P.STORE), hash, 'and leaves the save exactly as it was');
    assert.equal(f.get('share-tools').hidden, false);
    assert.equal(f.get('go-home').hidden, false);
  }
});

test('colour entry opens with an empty cube when no usable local progress exists', () => {
  for (const config of [{}, { storageBlocked: true }, { storage: new Map([[P.STORE, 'invalid']]) }]) {
    const f = fixture({ app: true, persistence: true, autoSolve: false, ...config });
    assert.equal(f.get('screen-capture').hidden, false);
    assert.ok(config.storageBlocked || P.decode(f.window.location.hash).names.every(name => name === null));
  }
});

test('a damaged shared link says so and leaves the saved lesson untouched', () => {
  const saved = fixture({ app: true, persistence: true, scramble: ['U2'] });
  saved.get('coach-move-track').children[1].onclick({ detail: 0 });
  const storage = new Map(saved.storage);
  const f = fixture({ app: true, persistence: true, autoSolve: false, storage, hash: '#p=3.invalid' });
  assert.equal(f.get('progress-error').hidden, false);
  assert.equal(storage.get(P.STORE), saved.window.location.hash);
  assert.deepEqual(f.coach.get(), saved.coach.get());
  const over = fixture({ app: true, persistence: true, autoSolve: false, storage, search: '?fresh=1' });
  assert.equal(over.get('progress-error').hidden, true);
  assert.equal(over.get('screen-capture').hidden, false);
  assert.ok(P.decode(over.window.location.hash).names.every(name => name === null));
});

test('Solve another one leaves for the chooser with the last cube still saved', () => {
  const f = fixture({ app: true, persistence: true, scramble: ['U2'] });
  f.get('coach-move-track').children[f.moves.length].onclick({ detail: 0 });
  const finished = f.storage.get(P.STORE);
  f.get('done-again').onclick();
  assert.equal(f.window.location.href, 'index.html');
  assert.equal(f.storage.get(P.STORE), finished, 'Keep the last cube until the child starts the next one');
  const next = fixture({ app: true, persistence: true, autoSolve: false, storage: f.storage, search: '?fresh=1' });
  assert.equal(next.get('screen-capture').hidden, false);
  assert.ok(P.decode(next.window.location.hash).names.every(name => name === null));
});

function repairCube(pieces = L.CORNERS, n = 0) {
  const names = Array.from(L.solvedState(), i => ['white', 'red', 'green', 'yellow', 'orange', 'blue'][i]);
  const before = names.slice(), piece = pieces[n];
  piece.forEach((index, k) => { names[index] = before[piece[(k + 1) % piece.length]]; });
  return names;
}

test('Solve diagnoses on the painted cube immediately; previews do not save or solve until confirmed', () => {
  for (const pieces of [L.CORNERS, L.EDGES]) {
    const names = repairCube(pieces);
    const f = fixture({ app: true, persistence: true, autoSolve: false, hash: P.encode({ view: 'capture', names }) });
    const originalHash = f.window.location.hash, originalStore = f.storage.get(P.STORE);
    f.get('cap-solve').onclick();
    assert.equal(f.get('screen-capture').hidden, false);
    assert.equal(f.get('screen-check').hidden, true);
    assert.equal(f.get('screen-coach').hidden, true);
    assert.equal(f.get('cap-issue').hidden, false);
    assert.equal(f.get('cap-cube').dataset.validationPhase, 'focus');
    assert.match(f.get('cap-issue-title').textContent, pieces === L.CORNERS ? /góc/ : /cạnh/);
    assert.equal(f.get('cap-issue-compare').hidden, false);
    assert.equal(f.initial, undefined, 'Never call the solver for invalid colours');
    const hex = f.window.CubeView.HEX;
    const suggestion = V.inspect(names).suggestions[0];
    for (const sticker of f.stickersIn(f.get('cap-cube'))) {
      assert.equal(sticker.style.background, hex[names[sticker.dataset.facelet]],
        'The big cube stays on the colours the child entered');
    }
    const shown = f.stickersIn(f.get('cap-issue-cube'));
    assert.equal(shown.length, 54, 'The suggestion is drawn on a cube of its own');
    for (const sticker of shown) {
      assert.equal(sticker.style.background, hex[suggestion.after[sticker.dataset.facelet]]);
    }
    assert.deepEqual(f.facing(f.get('cap-issue-cube')), f.facing(f.get('cap-cube')), 'and from the same angle');
    f.capture.look(12, 34, false);
    assert.deepEqual(f.facing(f.get('cap-issue-cube')), f.facing(f.get('cap-cube')),
      'which it keeps while the big cube is turned');
    f.suggested.look(56, 78, false);
    assert.deepEqual(f.facing(f.get('cap-cube')), f.facing(f.get('cap-issue-cube')),
      'and the big cube follows when that one is turned');
    assert.deepEqual(P.decode(f.window.location.hash).names, names, 'Turning either cube paints nothing');
    const cube = f.get('cap-cube'), drag = { pointerType: 'mouse', button: 2, target: cube, preventDefault() {} };
    cube.emit('pointerdown', { ...drag, clientX: 100, clientY: 100 });
    cube.emit('pointermove', { ...drag, clientX: 170, clientY: 120 });
    cube.emit('pointerup', { ...drag, clientX: 170, clientY: 120 });
    assert.equal(f.get('cap-cube').dataset.validationPhase, 'focus', 'Spinning to look from another side keeps the diagnosis');
    assert.deepEqual(f.facing(f.get('cap-issue-cube')), f.facing(cube));
    f.tick(12000);
    assert.equal(f.tasks.size, 0, 'Nothing is animating on the big cube');
    assert.equal(f.window.location.hash, originalHash);
    assert.equal(f.storage.get(P.STORE), originalStore);
    assert.deepEqual(P.decode(f.window.location.hash).names, names);
    // The child paints the correction in themselves, one sticker at a time.
    for (const index of suggestion.indices) f.paint(index, suggestion.after[index]);
    assert.equal(f.get('cap-issue').hidden, true);
    assert.equal(f.get('cap-cube').dataset.validationPhase, undefined);
    assert.equal(f.get('cap-issue-cube').dataset.validationPhase, undefined, 'and the suggestion is put away with it');
    assert.equal(f.get('screen-coach').hidden, true, 'Fixing the colours does not start a lesson by itself');
    assert.equal(V.assess(P.decode(f.window.location.hash).names).ok, true);
    assert.equal(f.storage.get(P.STORE), f.window.location.hash);
    f.get('cap-solve').onclick();
    assert.equal(f.get('screen-coach').hidden, false);
    assert.equal(f.tasks.size, 0, 'Solved capture has no leftover repair loop');
  }
});

test('other suggestions can be compared, painting dismisses stale diagnoses, and navigation cancels the loop', () => {
  const names = repairCube();
  const f = fixture({ app: true, persistence: true, autoSolve: false, hash: P.encode({ view: 'capture', names }) });
  f.get('cap-solve').onclick();
  const first = f.get('cap-issue-option').textContent;
  assert.equal(f.get('cap-issue-prev').disabled, true);
  f.get('cap-issue-next').onclick();
  assert.notEqual(f.get('cap-issue-option').textContent, first);
  assert.equal(f.get('cap-issue-prev').disabled, false);
  f.get('cap-issue-prev').onclick();
  assert.equal(f.get('cap-issue-option').textContent, first);
  f.tick(1500);
  f.paint(0, names[0]);
  assert.equal(f.get('cap-issue').hidden, true);
  assert.equal(f.get('cap-cube').dataset.validationPhase, undefined);
  assert.equal(f.tasks.size, 0);
  f.get('cap-solve').onclick();
  f.get('cap-clear').onclick();
  assert.equal(f.get('cap-issue').hidden, true);
  assert.equal(f.tasks.size, 0);
});

test('net entry errors also return to an animated cube and count errors have localized counts', () => {
  const names = repairCube(); names[1] = 'green';
  const f = fixture({ app: true, persistence: true, autoSolve: false, hash: P.encode({ view: 'check', names }) });
  f.get('net-solve').onclick();
  assert.equal(f.get('screen-check').hidden, true);
  assert.equal(f.get('screen-capture').hidden, false);
  assert.equal(f.get('cap-issue-counts').hidden, false);
  assert.equal(f.get('cap-issue-counts').children.length, 6);
  assert.match(f.get('cap-issue-title').textContent, /Số ô màu/);
  assert.equal(f.get('cap-issue-compare').hidden, true, 'No unverified correction for simultaneous errors');
  assert.equal(f.initial, undefined);
});

test('the diagnosis drops its highlight in a hidden tab and comes back with it, leaving no timers', () => {
  const names = repairCube(L.EDGES);
  const f = fixture({ app: true, persistence: true, autoSolve: false, reducedMotion: true, hash: P.encode({ view: 'capture', names }) });
  f.get('cap-solve').onclick();
  assert.equal(f.get('cap-cube').dataset.validationPhase, 'focus');
  assert.equal(f.tasks.size, 0, 'Reduced motion still turns straight to the piece');
  f.document.hidden = true; f.listeners.visibilitychange();
  assert.equal(f.get('cap-cube').dataset.validationPhase, undefined);
  assert.equal(f.tasks.size, 0);
  f.document.hidden = false; f.listeners.visibilitychange();
  assert.equal(f.get('cap-cube').dataset.validationPhase, 'focus');
  assert.equal(f.stickersIn(f.get('cap-issue-cube')).length, 54);
});

test('every corner and edge correction is that piece turned in place, nothing else touched', () => {
  for (const pieces of [L.CORNERS, L.EDGES]) for (let n = 0; n < pieces.length; n++) {
    const names = repairCube(pieces, n), before = names.slice();
    const suggestion = V.inspect(names).suggestions[0];
    const piece = pieces[n], len = piece.length;
    // The suggestion must be this piece's own stickers moved round by one
    // whole turn of it: a corner twisted, an edge flipped. Nothing invented.
    const shifts = [];
    for (let shift = 1; shift < len; shift++) {
      if (piece.every((index, k) => suggestion.after[piece[(k + shift) % len]] === names[index])) shifts.push(shift);
    }
    assert.equal(shifts.length, 1, 'Exactly one turn of the piece explains the correction');
    names.forEach((colour, index) => {
      if (piece.indexOf(index) < 0) assert.equal(suggestion.after[index], colour, 'The rest of the cube is left alone');
    });
    for (const index of suggestion.indices) assert.ok(piece.indexOf(index) >= 0, 'Only this piece is singled out');
    names.forEach((colour, index) => {
      if (suggestion.after[index] !== colour) assert.ok(suggestion.indices.indexOf(index) >= 0, 'Every changed sticker is singled out');
    });
    assert.equal(V.assess(suggestion.after).ok, true, 'and the corrected cube is solvable');
    assert.deepEqual(names, before, 'Looking at a suggestion never edits the entered colours');
  }
});

test('cube face selection supports mouse and touch rotation without painting or selecting on a drag', () => {
  for (const pointerType of ['mouse', 'touch']) {
    const f = fixture(), host = f.get('cap-cube');
    const view = f.window.CubeView.create(host, null, { tapToSelect: true });
    const selections = [], names = new Array(54).fill(null);
    view.setNames(names); view.onSticker(index => selections.push(index));
    const sticker = host.children[0].children.flatMap(e => e.children).find(e => e.dataset.facelet === 22);
    const event = { pointerType, pointerId: 3, button: 0, clientX: 100, clientY: 100, target: sticker, preventDefault() {} };
    const before = view.angles();
    host.emit('pointerdown', event);
    assert.equal(selections.length, 0, 'Wait until release to distinguish a tap from a drag');
    host.emit('pointermove', { ...event, clientX: 240 });
    host.emit('pointerup', { ...event, clientX: 240 });
    assert.notEqual(view.angles().ry, before.ry);
    assert.equal(selections.length, 0);
    host.emit('pointerdown', event); host.emit('pointerup', event);
    assert.deepEqual(selections, [22]);
    host.emit('pointerdown', event); host.emit('pointercancel', event); host.emit('pointerup', event);
    assert.deepEqual(selections, [22], 'A cancelled gesture cannot select a face');
    assert.ok(names.every(c => c === null), 'Orbiting never writes centre colours');
  }
});

test('the selected face follows actual cube orientation and every named face can be brought into view', () => {
  const f = fixture(), view = f.window.CubeView.create(f.get('cap-cube'));
  let front;
  view.onView((rx, ry, face) => { front = face; });
  for (let rx = -540; rx <= 540; rx += 23) for (let ry = -450; ry <= 450; ry += 31) {
    view.look(rx, ry, false);
    assert.equal(front, K.frameFromView(rx, ry).front, 'Centre selection must agree with the visible 3D face');
  }
  for (const start of [[-22, -32], [156, 1000], [-540, -720]]) for (const face of L.FACE_ORDER) {
    view.look(...start, false); view.lookFace(face, false);
    assert.equal(front, face);
    const angle = view.angles();
    assert.ok(Number.isFinite(angle.rx) && Number.isFinite(angle.ry));
    assert.equal(K.frameFromView(angle.rx, angle.ry).front, face);
  }
});

test('every Solve press keeps the cube on the tried shelf, newest first, never twice and at most six', () => {
  const storage = new Map();
  const f = fixture({ app: true, persistence: true, autoSolve: false, storage });
  assert.equal(f.get('cube-history').hidden, true);
  f.get('cap-solve').onclick();
  assert.equal(f.get('cube-history').hidden, true, 'An untouched cube is not a cube anyone tried');
  f.paint(0, 'red');
  f.get('cap-solve').onclick();
  assert.equal(f.get('cube-history').hidden, false, 'An unfinished cube is kept too');
  assert.equal(f.get('history-list').children.length, 1);
  f.get('cap-solve').onclick();
  assert.equal(f.get('history-list').children.length, 1, 'The same cube is never kept twice');
  for (const colour of ['green', 'blue', 'yellow', 'orange', 'white', 'red']) {
    f.paint(1, colour);
    f.get('cap-solve').onclick();
  }
  assert.equal(f.get('history-list').children.length, 6, 'The shelf holds six cubes at most');
  const reloaded = fixture({ app: true, persistence: true, autoSolve: false, storage });
  assert.equal(reloaded.get('history-list').children.length, 6, 'The shelf survives a reload');
  const before = f.window.location.hash;
  f.get('history-list').children[5].onclick();
  assert.equal(f.get('history-confirm').hidden, false, 'A shelf cube asks before it replaces the one in hand');
  assert.equal(f.get('history-confirm-cube').children.length, 1, 'The question shows the cube it is about to open');
  f.get('history-confirm-no').onclick();
  assert.equal(f.get('history-confirm').hidden, true);
  assert.equal(f.window.location.hash, before, 'Saying no leaves the colours alone');
  f.get('history-list').children[5].onclick();
  f.get('history-confirm-yes').onclick();
  assert.equal(f.get('history-confirm').hidden, true);
  const picked = P.decode(f.window.location.hash);
  assert.equal(picked.view, 'capture');
  assert.equal(picked.names[0], 'red');
  assert.equal(picked.names[1], 'green', 'The cube comes back exactly as it was pressed');
});

test('the glowing side belongs to the camera: nothing is singled out while it is off', () => {
  const f = fixture({ app: true, persistence: true, autoSolve: false });
  const lit = () => f.cubeIn(f.get('cap-cube')).children
    .filter(el => el.className === 'face-light' && el.classList.contains('is-lit')).length;
  assert.equal(lit(), 0, 'Painting on your own needs no side picked out');
  f.get('cap-open-cam').onclick();
  assert.equal(lit(), 1, 'The camera writes onto the side facing the child, so that one glows');
  f.get('cam-close').onclick();
  assert.equal(lit(), 0);
});

test('the way out of the suggestions puts them away and leaves the colours alone', () => {
  const names = repairCube(L.CORNERS);
  const f = fixture({ app: true, persistence: true, autoSolve: false, hash: P.encode({ view: 'capture', names }) });
  f.get('cap-solve').onclick();
  assert.equal(f.get('cap-issue').hidden, false);
  const hash = f.window.location.hash;
  f.get('cap-issue-close').onclick();
  assert.equal(f.get('cap-issue').hidden, true);
  assert.equal(f.get('cap-cube').dataset.validationPhase, undefined, 'the big cube goes back to normal');
  assert.equal(f.get('cap-issue-cube').dataset.validationPhase, undefined, 'and so does the suggested one');
  assert.equal(f.window.location.hash, hash, 'Leaving the suggestions repaints nothing');
  assert.equal(f.tasks.size, 0);
  assert.deepEqual(P.decode(f.window.location.hash).names, names);
});

test('stepping to another suggestion turns both cubes over, and dragging keeps them together', () => {
  const names = repairCube(L.CORNERS);
  const f = fixture({ app: true, persistence: true, autoSolve: false, hash: P.encode({ view: 'capture', names }) });
  f.get('cap-solve').onclick();
  const before = f.facing(f.get('cap-cube'));
  f.get('cap-issue-next').onclick();
  for (const id of ['cap-cube', 'cap-issue-cube']) {
    const turn = (f.cubeIn(f.get(id)).played || []).at(-1);
    assert.ok(turn, 'both cubes play the turn to the next piece: ' + id);
    assert.equal(turn.options.duration, 550);
    assert.notEqual(turn.frames[0].transform, turn.frames[1].transform, 'from where it was to where it goes');
    assert.equal(turn.frames[1].transform, f.cubeIn(f.get(id)).style.transform, 'ending where the cube now is');
  }
  assert.notDeepEqual(f.facing(f.get('cap-cube')), before, 'and the angle really changes');
  assert.deepEqual(f.facing(f.get('cap-issue-cube')), f.facing(f.get('cap-cube')));
  // A drag is the opposite case: the other cube has to keep up, not lag behind.
  const cube = f.get('cap-cube'), drag = { pointerType: 'mouse', button: 2, target: cube, preventDefault() {} };
  cube.emit('pointerdown', { ...drag, clientX: 100, clientY: 100 });
  cube.emit('pointermove', { ...drag, clientX: 180, clientY: 130 });
  const played = (f.cubeIn(f.get('cap-issue-cube')).played || []).length;
  cube.emit('pointermove', { ...drag, clientX: 220, clientY: 150 });
  cube.emit('pointerup', { ...drag, clientX: 220, clientY: 150 });
  assert.equal((f.cubeIn(f.get('cap-issue-cube')).played || []).length, played, 'a drag is followed at once, not played');
  assert.deepEqual(f.facing(f.get('cap-issue-cube')), f.facing(cube));
});
test('both cubes turn to the angle that shows the most of the pieces in question', () => {
  // How far a side leans towards the viewer: below 0.3 it is too edge-on to
  // read a colour off. Opposite sides can never both face the child, so some
  // views are simply impossible; what is asked here is the best one there is.
  const depth = (face, [rx, ry]) => {
    const n = L.FACELETS[L.FACE_INDEX[face] * 9 + 4].pos;
    const x = rx * Math.PI / 180, y = ry * Math.PI / 180;
    return -n[1] * Math.sin(x) + (-n[0] * Math.sin(y) + n[2] * Math.cos(y)) * Math.cos(x);
  };
  // Every view, finer than the one the page searches, so the answer is reached
  // another way: how many pieces keep a square in sight, and how many squares.
  const views = [];
  for (let rx = -70; rx <= 70; rx += 2) for (let ry = -180; ry < 180; ry += 2) views.push([rx, ry]);
  const counts = (groups, angle) => {
    let kept = 0, seen = 0;
    for (const sides of groups) {
      const visible = sides.filter(face => depth(face, angle) >= 0.3).length;
      if (visible) kept++;
      seen += visible;
    }
    return { kept, seen };
  };
  const theBest = (f, id, groups) => {
    let best = { kept: -1, seen: -1 };
    for (const angle of views) {
      const at = counts(groups, angle);
      if (at.kept > best.kept || (at.kept === best.kept && at.seen > best.seen)) best = at;
    }
    const angle = f.facing(f.get(id));
    const at = counts(groups, angle);
    const where = id + ' at ' + angle + ' with ' + groups.map(g => g.join('')).join(' / ');
    assert.equal(at.kept, best.kept, 'every piece that can keep a square in sight does: ' + where);
    assert.equal(at.seen, best.seen, 'and as many squares as that angle allows: ' + where);
  };

  for (const pieces of [L.CORNERS, L.EDGES]) {
    const names = repairCube(pieces);
    const f = fixture({ app: true, persistence: true, autoSolve: false, hash: P.encode({ view: 'capture', names }) });
    f.get('cap-solve').onclick();
    const report = V.inspect(names);
    for (let step = 0; step < 8 && step < report.suggestions.length; step++) {
      const lit = f.stickersIn(f.get('cap-cube')).filter(el => el.classList.contains('validation-target'));
      assert.ok(lit.length, 'a suggestion always marks the stickers it means');
      const groups = report.suggestions[step].pieces
        .map(piece => piece.filter(i => lit.some(el => Number(el.dataset.facelet) === i))
          .map(i => L.FACELETS[i].face));
      for (const id of ['cap-cube', 'cap-issue-cube']) theBest(f, id, groups);
      f.get('cap-issue-next').onclick();
    }
    // Pieces far apart are the hard case: aiming at the first sticker alone
    // used to leave the rest of them round the back.
    const facelet = (face, row, col) => L.FACE_INDEX[face] * 9 + row * 3 + col;
    const spreads = [
      [[facelet('F', 1, 1)], [facelet('R', 1, 1)]],
      [[facelet('U', 2, 2), facelet('F', 0, 2), facelet('R', 0, 0)]],
      [[facelet('F', 1, 0), facelet('L', 1, 2)], [facelet('U', 1, 1)]],
      [[facelet('U', 0, 1), facelet('B', 0, 1)], [facelet('D', 0, 1), facelet('F', 2, 1)]]
    ];
    for (const spread of spreads) {
      const indices = spread.reduce((all, piece) => all.concat(piece), []);
      f.capture.showRepair({ indices, pieces: spread, animate: true });
      theBest(f, 'cap-cube', spread.map(piece => piece.map(i => L.FACELETS[i].face)));
    }
  }
});

test('a square that has to stay round the back is said to be there', () => {
  // Two squares on opposite sides: no angle shows both, so the child is told
  // rather than left comparing against something they cannot see.
  // Two edges in each other's places: a swap that face turns cannot reach, and
  // one whose suggestions include pieces lying on one and the same axis.
  const names = Array.from(L.solvedState(), i => ['white', 'red', 'green', 'yellow', 'orange', 'blue'][i]);
  const [first, second] = L.EDGES;
  first.forEach((index, n) => { [names[index], names[second[n]]] = [names[second[n]], names[index]]; });
  const f = fixture({ app: true, persistence: true, autoSolve: false, hash: P.encode({ view: 'capture', names }) });
  f.get('cap-solve').onclick();
  const report = V.inspect(names);
  const axisOf = i => L.FACELETS[L.FACE_INDEX[L.FACELETS[i].face] * 9 + 4].pos.findIndex(v => v);
  const hidden = report.suggestions.findIndex(s =>
    s.indices.length === 2 && axisOf(s.indices[0]) === axisOf(s.indices[1]));
  assert.ok(hidden > 0, 'this cube offers a suggestion whose squares face opposite ways');
  const plain = f.get('cap-issue-hint').textContent;
  for (let step = 0; step < hidden; step++) f.get('cap-issue-next').onclick();
  const told = f.get('cap-issue-hint').textContent;
  assert.notEqual(told, plain);
  assert.match(told, /khu\u1EA5t/, 'the hint says a square is round the back');
  f.get('cap-issue-prev').onclick();
  assert.equal(f.get('cap-issue-hint').textContent, plain, 'and stops saying so once it is not');
});

test('a square round the back is pointed at, and the arrow follows as the cube turns', () => {
  const names = Array.from(L.solvedState(), i => ['white', 'red', 'green', 'yellow', 'orange', 'blue'][i]);
  const [first, second] = L.EDGES;
  first.forEach((index, n) => { [names[index], names[second[n]]] = [names[second[n]], names[index]]; });
  const f = fixture({ app: true, persistence: true, autoSolve: false, hash: P.encode({ view: 'capture', names }) });
  f.get('cap-solve').onclick();
  const arrows = id => {
    const layer = f.get(id).children.find(el => el.className === 'repair-arrows');
    assert.ok(layer, 'the cube carries a layer for the arrows: ' + id);
    return layer.children.map(el => {
      const turn = el.style.transform.match(/rotate\((-?[\d.]+)deg\)/);
      assert.ok(turn, 'an arrow is placed round the cube: ' + el.style.transform);
      return Math.round(Number(turn[1]));
    });
  };
  // Two squares facing opposite ways: whichever the cube is turned to, the
  // other is round the back, and the arrow says on which side.
  const top = L.FACE_INDEX.U * 9 + 4, bottom = L.FACE_INDEX.D * 9 + 4;
  f.capture.look(-42, 0, false);
  f.capture.showRepair({ indices: [top, bottom], pieces: [[top], [bottom]], hold: true, arrows: true });
  assert.deepEqual(arrows('cap-cube'), [90], 'the bottom square is behind, so the arrow stands below');
  f.capture.look(42, 0, false);
  assert.deepEqual(arrows('cap-cube'), [-90], 'turned over, it is the top square that is behind');
  f.capture.look(-42, 0, false);
  assert.deepEqual(arrows('cap-cube'), [90], 'and back again');
  // Each square has its own arrow, on its own line out of the cube, not one
  // for the side they share.
  const back = L.FACE_INDEX.B * 9;
  f.capture.look(-30, 0, false);
  f.capture.showRepair({ indices: [back, back + 8], pieces: [[back], [back + 8]], hold: true, arrows: true });
  const pair = arrows('cap-cube');
  assert.equal(pair.length, 2, 'two squares behind, two arrows');
  assert.notEqual(pair[0], pair[1], 'each one on the line to its own square');
  // A corner has all its squares on sides that can be seen together.
  const corner = L.CORNERS.find(piece => piece.every(i => ['U', 'F', 'R'].includes(L.FACELETS[i].face)));
  f.capture.showRepair({ indices: corner.slice(), pieces: [corner.slice()], arrows: true });
  assert.deepEqual(arrows('cap-cube'), [], 'nothing is hidden, so nothing is pointed at');
  f.capture.stopRepair();
  assert.deepEqual(arrows('cap-cube'), []);

  // In the page the arrows belong to the suggested cube alone: it is the one
  // being copied from, and arrows on both would be a busy thing to read.
  f.get('cap-solve').onclick();
  const axisOf = i => L.FACELETS[L.FACE_INDEX[L.FACELETS[i].face] * 9 + 4].pos.findIndex(v => v);
  const report = V.inspect(names);
  const hidden = report.suggestions.findIndex(s =>
    s.indices.length === 2 && axisOf(s.indices[0]) === axisOf(s.indices[1]));
  for (let step = 0; step < hidden; step++) f.get('cap-issue-next').onclick();
  assert.equal(arrows('cap-issue-cube').length, 1, 'the suggested cube points at the square behind it');
  assert.deepEqual(arrows('cap-cube'), [], 'the cube holding the child\'s own colours stays plain');
  f.get('cap-issue-close').onclick();
  assert.deepEqual(arrows('cap-issue-cube'), [], 'and the arrows go with the suggestions');
});

test('a square can keep its arrow outside any suggestion, as the centre picker needs', () => {
  // The step guide's picker has no validation running: the sides still waiting
  // for a colour carry an arrow for as long as they are round the back, and the
  // arrow leaves the moment the cube is turned to them.
  const f = fixture({ app: true, persistence: true, autoSolve: false,
    hash: P.encode({ view: 'capture', names: Array(54).fill(null) }) });
  const arrows = () => f.get('cap-cube').children.find(el => el.className === 'repair-arrows')
    .children.map(el => Math.round(Number(el.style.transform.match(/rotate\((-?[\d.]+)deg\)/)[1])));
  const top = L.FACE_INDEX.U * 9 + 4, bottom = L.FACE_INDEX.D * 9 + 4;
  f.capture.look(-42, 0, false);
  f.capture.pointAt([top, bottom]);
  assert.deepEqual(arrows(), [90], 'the bottom side is behind, so its arrow stands below');
  f.capture.look(42, 0, false);
  assert.deepEqual(arrows(), [-90], 'turned over, it is the top side that is pointed at');
  f.capture.pointAt([bottom]);
  assert.deepEqual(arrows(), [], 'a side the child is looking at needs no arrow');
  f.capture.pointAt([]);
  f.capture.look(-42, 0, false);
  assert.deepEqual(arrows(), [], 'nothing left to colour, nothing pointed at');
});
