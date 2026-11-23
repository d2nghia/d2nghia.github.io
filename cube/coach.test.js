/** Run with: node --test cube/coach.test.js */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('./solver.js');
const K = require('./capture.js');
const P = require('./progress.js');
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
      setPointerCapture(id) { this.capturedPointer = id; },
      releasePointerCapture() { this.capturedPointer = null; },
      focus() { document.activeElement = this; },
      getBoundingClientRect() { return { left: 16, top: 20, width: 728, height: 454 }; },
      closest(selector) {
        if (selector === 'button[data-step]' && this.dataset.step != null) return this;
        if (selector === '#coach-move-track, #coach-resize') {
          for (let node = this; node; node = node.parent) if (['coach-move-track', 'coach-resize'].includes(node.id)) return node;
        }
        return null;
      },
      querySelectorAll() { return []; }, querySelector() { return null; },
      appendChild(child) { this.children.push(child); child.parent = this; },
      remove() { this.parent.children = this.parent.children.filter(c => c !== this); }
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return this.markup || ''; },
      set(value) { this.markup = value; this.children = []; }
    });
    return el;
  }
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
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
    location: { pathname: '/cube/index.html', search: search ?? (persistence ? '' : '?autofill=random'), hash },
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
    window, self: window, document, URLSearchParams, Int8Array, performance: { now: () => now },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; resizeObservers.push(this); }
      observe(host) { this.host = host; }
    },
    setTimeout: schedule, clearTimeout: id => tasks.delete(id),
    clearInterval() {}, requestAnimationFrame: fn => schedule(fn, framesPaused ? 1000000 : 16),
    cancelAnimationFrame: id => tasks.delete(id),
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error('Storage unavailable'); return persistence ? storage.get(key) || null : null; },
      setItem(key, value) {
        if (storageBlocked) throw new Error('Storage unavailable');
        assert.ok(persistence, 'Test cubes must not be saved'); storage.set(key, value);
      },
      removeItem(key) {
        if (storageBlocked) throw new Error('Storage unavailable');
        assert.ok(persistence, 'Test cubes must not erase saved cubes'); storage.delete(key);
      }
    }
  });
  const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
  run('progress.js');
  run('cubeview.js');
  let coach, initial, solution, pendingMove, faceColours, paintSticker;
  if (app) {
    if (solved) window.CubeLib.randomScramble = () => [];
    else if (scramble) window.CubeLib.randomScramble = () => scramble;
    const create = window.CubeView.create;
    window.CubeView.create = function (host, colours) {
      const view = create(host, colours);
      if (host.id === 'cap-cube') {
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
    if (autoSolve && get('screen-coach').hidden) {
      if (!get('screen-capture').hidden) get('cap-solve').onclick();
      else get('go-demo').onclick();
    }
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
    paint(index, colour) {
      get('cap-palette').children.find(button => button.title === colour).onclick();
      paintSticker(index);
    },
    pauseFrames() { framesPaused = true; },
    replay() { listeners.keydown({ key: ' ', target: get('coach-cube'), preventDefault() {} }); },
    get coach() { return coach; }, get initial() { return initial; }, get solution() { return solution; },
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
  assert.equal(get('screen-start').hidden, false);
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
  assert.equal(get('screen-start').hidden, false);
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
  assert.equal(get('screen-start').hidden, false);
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
  assert.equal(get('screen-start').hidden, false);
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
    assert.equal(panel.style.height, '676px');
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
    assert.equal(new URLSearchParams(hash.slice(1)).get('step'), String(index + 1));
    const shared = fixture({ app: true, persistence: true, hash, autoSolve: false });
    const reloaded = fixture({ app: true, persistence: true, storage: new Map(f.storage), autoSolve: false });
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
  assert.equal(f.window.location.pathname, '/cube/index.html');
});

test('confirmations and undo are saved before their animations finish', async () => {
  const f = fixture({ app: true, persistence: true, scramble: ['U2'] });
  f.get('coach-next').onclick();
  const next = fixture({ app: true, persistence: true, storage: new Map(f.storage), autoSolve: false });
  assert.deepEqual(next.coach.get(), L.applyMoves(f.initial, ['U']));
  assert.equal(new URLSearchParams(next.window.location.hash.slice(1)).get('step'), '2');
  await f.settle();
  const stable = f.window.location.hash;
  f.tick(15000);
  assert.equal(f.window.location.hash, stable, 'Repeating previews must not advance saved progress');
  f.get('coach-back').onclick();
  const back = fixture({ app: true, persistence: true, storage: new Map(f.storage), autoSolve: false });
  assert.deepEqual(back.coach.get(), f.initial);
  assert.equal(new URLSearchParams(back.window.location.hash.slice(1)).get('step'), '1');
});

test('painting and clearing capture colours update both the URL and local storage immediately', () => {
  const f = fixture({ app: true, persistence: true, autoSolve: false });
  f.get('go-camera').onclick();
  f.paint(0, 'red'); f.paint(4, 'white'); f.paint(18, 'blue');
  const hash = f.window.location.hash, saved = P.decode(hash);
  assert.equal(saved.view, 'capture');
  assert.equal(saved.names[0], 'red'); assert.equal(saved.names[18], 'blue');
  assert.equal(saved.names[1], null);
  assert.equal(f.storage.get(P.STORE), hash);
  for (const config of [{ hash }, { storage: new Map(f.storage) }]) {
    const restored = fixture({ app: true, persistence: true, autoSolve: false, ...config });
    assert.equal(restored.get('screen-capture').hidden, false);
    assert.deepEqual(P.decode(restored.window.location.hash).names, saved.names);
  }
  f.get('cap-clear').onclick();
  assert.ok(P.decode(f.window.location.hash).names.every(name => name === null));
  assert.ok(P.decode(f.storage.get(P.STORE)).names.every(name => name === null));
});

test('manual colour edits are shared and restored in the manual editor', () => {
  const f = fixture({ app: true, persistence: true, autoSolve: false });
  f.get('go-manual').onclick();
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
  assert.equal(invalid.get('screen-start').hidden, false);
  assert.equal(invalid.get('progress-error').hidden, false);
  assert.equal(storage.get(P.STORE), hash);
  assert.equal(invalid.replacements.length, 0);
});

test('valid progress links still work with blocked storage, and local saving survives a blocked History API', () => {
  const f = fixture({ app: true, persistence: true, storageBlocked: true, scramble: ['U2'] });
  f.get('coach-move-track').children[1].onclick({ detail: 0 });
  const restored = fixture({ app: true, persistence: true, storageBlocked: true, hash: f.window.location.hash, autoSolve: false });
  assert.deepEqual(restored.coach.get(), f.coach.get());
  const noHistory = fixture({ app: true, persistence: true, autoSolve: false, scramble: ['U2'] });
  noHistory.window.history.replaceState = () => { throw new Error('History blocked'); };
  noHistory.get('go-demo').onclick();
  assert.equal(P.decode(noHistory.storage.get(P.STORE)).view, 'coach');
});

test('older saved colours migrate automatically and corrupt local progress does not break startup', () => {
  const names = Array(54).fill(null); names[4] = 'yellow'; names[9] = 'orange';
  const storage = new Map([['cube-coach/cube2', JSON.stringify({ names })], [P.STORE, '{invalid}']]);
  const migrated = fixture({ app: true, persistence: true, storage, autoSolve: false });
  assert.equal(migrated.get('screen-capture').hidden, false);
  assert.deepEqual(P.decode(storage.get(P.STORE)).names, names);
  const broken = fixture({ app: true, persistence: true, storage: new Map([[P.STORE, 'broken']]), autoSolve: false });
  assert.equal(broken.get('screen-start').hidden, false);
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

test('the random-colour testing entry point does not overwrite a saved lesson', () => {
  const saved = fixture({ app: true, persistence: true, scramble: ['U2'] });
  const storage = new Map(saved.storage), before = storage.get(P.STORE);
  const f = fixture({ app: true, persistence: true, storage, search: '?autofill=random', scramble: ['R'] });
  assert.equal(f.window.location.hash, '');
  assert.equal(storage.get(P.STORE), before);
});

test('autofill overrides shared progress and malformed fragments without changing saved progress', () => {
  const saved = fixture({ app: true, persistence: true, scramble: ['U2'] });
  const partial = P.encode({ view: 'capture', names: Array(54).fill(null) });
  const expected = L.applyMoves(L.solvedState(), ['R']);
  const colours = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];
  for (const hash of [saved.window.location.hash, partial, '#v=1&cube=broken']) {
    const storage = new Map(saved.storage), before = [...storage];
    const f = fixture({ app: true, persistence: true, autoSolve: false, storage,
      search: '?autofill=random', hash, scramble: ['R'] });
    assert.equal(f.get('screen-capture').hidden, false);
    assert.equal(f.get('progress-error').hidden, true);
    assert.equal(f.window.location.hash, '');
    assert.equal(f.window.location.search, '?autofill=random');
    const stickers = f.get('cap-cube').children[0].children
      .filter(el => el.className === 'cubie').flatMap(el => el.children)
      .filter(el => el.dataset.facelet != null);
    assert.equal(stickers.length, 54);
    for (const sticker of stickers) {
      assert.equal(sticker.style.background, f.window.CubeView.HEX[colours[expected[sticker.dataset.facelet]]]);
    }
    assert.deepEqual([...storage], before);
    f.window.location.hash = saved.window.location.hash;
    f.windowListeners.hashchange.forEach(fn => fn());
    assert.equal(f.get('screen-capture').hidden, false, 'Testing must not switch into a saved lesson');
    f.get('cap-solve').onclick();
    assert.equal(f.solution.ok, true);
    assert.deepEqual([...storage], before);
  }
});
