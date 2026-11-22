/** Run with: node --test cube/coach.test.js */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('./solver.js');
const K = require('./capture.js');
const langContext = { module: { exports: {} }, localStorage: { getItem: () => null } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'lang.js'), 'utf8'), langContext);
const LANG = langContext.module.exports;

function fixture({ app = false, reducedMotion = false, solved = false, scramble } = {}) {
  let now = 0, serial = 0, framesPaused = false;
  const tasks = new Map(), listeners = {}, nodes = new Map();
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
      style: {}, dataset: {}, children: [], hidden: false, clientWidth: 300,
      classList: {
        add(...names) { names.forEach(n => classes.add(n)); },
        remove(...names) { names.forEach(n => classes.delete(n)); },
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      setAttribute() {}, addEventListener() {}, closest() { return null; },
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
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
    const el = element(); el.id = id;
    el.hidden = id.startsWith('screen-') && id !== 'screen-start';
    nodes.set(id, el);
  }
  const get = id => { assert.ok(nodes.has(id), 'Missing HTML element: ' + id); return nodes.get(id); };
  const document = {
    hidden: false, createElement: element, getElementById: get,
    addEventListener(name, fn) { listeners[name] = fn; }
  };
  const window = {
    CubeLib: { ...L }, CubeCapture: K, location: { search: '?autofill=random' },
    scrollTo() {}, addEventListener() {}, matchMedia: () => ({ matches: reducedMotion }),
    CubeLang: { t: LANG.t, colour: LANG.colour, apply() {}, onChange(fn) { this.change = fn; }, toggle() { this.change(); } }
  };
  const context = vm.createContext({
    window, document, URLSearchParams, Int8Array, performance: { now: () => now },
    setTimeout: schedule, clearTimeout: id => tasks.delete(id),
    clearInterval() {}, requestAnimationFrame: fn => schedule(fn, framesPaused ? 1000000 : 16),
    cancelAnimationFrame: id => tasks.delete(id),
    localStorage: { getItem: () => null, setItem() { assert.fail('Test cubes must not be saved'); }, removeItem() { assert.fail('Test cubes must not erase saved cubes'); } }
  });
  const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
  run('cubeview.js');
  let coach, initial, solution, pendingMove, faceColours;
  if (app) {
    if (solved) window.CubeLib.randomScramble = () => [];
    else if (scramble) window.CubeLib.randomScramble = () => scramble;
    const create = window.CubeView.create;
    window.CubeView.create = function (host, colours) {
      const view = create(host, colours);
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
    get('cap-solve').onclick();
  }
  async function settle(ms = 2000) {
    tick(ms);
    await Promise.resolve();
  }
  async function advance(dir = 1) {
    get(dir > 0 ? 'coach-next' : 'coach-back').onclick();
    await settle();
  }
  return { window, document, listeners, get, tick, tasks, settle, advance,
    pauseFrames() { framesPaused = true; },
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
    assert.equal(host.dataset.demoPhase, 'focus');
    const cubies = cube.children.filter(el => el.className === 'cubie');
    const original = cubies.map(el => el.style.transform);
    f.tick(1300);
    assert.equal(host.dataset.demoPhase, 'turn');
    assert.equal(cubies.filter((el, i) => el.style.transform !== original[i]).length, 9);
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
  for (const id of ['coach-next', 'coach-back', 'coach-again']) assert.equal(get(id).disabled, true);
  assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 1, total: moves.length }));
  for (let i = 0; i < 5; i++) {
    get('coach-next').onclick();
    get('coach-back').onclick();
    get('coach-again').onclick();
    f.listeners.keydown({ key: 'ArrowRight', repeat: true, preventDefault() {} });
  }
  get('lang-switch').onclick();
  assert.deepEqual(pose(), before, 'Other controls cannot reset an in-flight turn');
  f.tick(32);
  assert.notDeepEqual(pose(), before);
  assert.deepEqual(coach.get(), initial);
  await f.settle();
  assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, 1)));
  assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 2, total: moves.length }));
  for (const id of ['coach-next', 'coach-back', 'coach-again']) assert.equal(get(id).disabled, false);
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
  assert.equal(get('screen-done').hidden, true);
  assert.deepEqual(coach.get(), initial);
  await f.settle();
  assert.equal(get('screen-done').hidden, false);
  assert.equal(L.isSolved(coach.get()), true);
  assert.equal(f.tasks.size, 0);
});

test('reduced motion advances promptly without a turn animation', async () => {
  const f = fixture({ app: true, reducedMotion: true, scramble: ['U'] });
  f.get('coach-next').onclick();
  await f.settle(16);
  assert.equal(f.get('screen-done').hidden, false);
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
  assert.equal(f.get('screen-done').hidden, false);
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
  get('coach-again').onclick();
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
  assert.equal(get('screen-done').hidden, false);
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
  f.listeners.keydown({ key: ' ', preventDefault() { assert.fail('Shortcuts only apply to the lesson'); } });
  assert.equal(get('screen-done').hidden, false);
  assert.equal(f.tasks.size, 0);
});

test('a double turn becomes two numbered, separately confirmed quarter turns', async () => {
  const f = fixture({ app: true, scramble: ['U2'] }), { coach, initial, get } = f;
  assert.deepEqual(f.solution.moves, ['U2']);
  const track = get('coach-move-track');
  assert.deepEqual(track.children.map(n => n.textContent), [1, 2]);
  assert.equal(track.children[0].className, 'on');
  assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 1, total: 2 }));
  assert.equal(f.pendingMove, 'U');
  f.tick(1800);
  assert.equal(get('coach-cube').dataset.demoPhase, 'hold');
  const cubies = get('coach-cube').children[0].children.filter(el => el.className === 'cubie');
  assert.equal(cubies.filter(el => el.style.transform.startsWith('rotateY(-90deg)')).length, 9);
  await f.advance();
  assert.deepEqual(coach.get(), L.applyMoves(initial, ['U']), 'The halfway state must be a real step');
  assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 2, total: 2 }));
  assert.equal(track.children[0].className, 'done');
  assert.equal(track.children[1].className, 'on');
  assert.equal(f.pendingMove, 'U', 'The repeated action keeps the same direction');
  get('coach-again').onclick();
  f.tick(10000);
  assert.equal(track.children[1].className, 'on', 'Repeats keep the same step number');
  await f.advance(-1);
  assert.deepEqual(coach.get(), initial);
  assert.equal(track.children[0].className, 'on');
  await f.advance();
  assert.equal(get('screen-coach').hidden, false);
  await f.advance();
  assert.equal(get('screen-done').hidden, false);
  assert.equal(L.isSolved(coach.get()), true);
  assert.equal(get('done-count').textContent, LANG.t('coach.done.count', { n: 2 }));
});

test('every numbered action is a quarter turn and the count covers the whole solve', async () => {
  const f = fixture({ app: true }), { coach, initial, moves, get } = f;
  assert.equal(get('coach-move-track').children.length, moves.length);
  for (let i = 0; i < moves.length; i++) {
    assert.match(f.pendingMove, /^[URFDLB]'?$/);
    assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: i + 1, total: moves.length }));
    assert.deepEqual(coach.get(), L.applyMoves(initial, moves.slice(0, i)));
    await f.advance();
  }
  assert.equal(L.isSolved(coach.get()), true);
  assert.equal(get('screen-done').hidden, false);
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
    assert.equal(get('coach-move-track').children.length, f.moves.length);
    assert.equal(get('coach-progress').textContent, LANG.t('coach.progress', { current: 1, total: f.moves.length }));
    for (let i = 0; i < f.moves.length; i++) await f.advance();
    assert.equal(L.isSolved(coach.get()), true);
    assert.equal(get('screen-done').hidden, false);
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
  assert.equal(get('screen-done').hidden, false);
});

test('the goal uses the child\'s orange starting layer and survives replay and back', async () => {
  const map = L.rotateFaces(L.FACE_ORDER, 'z');
  const scramble = L.inverse(L.ALGS.cornerInsert).concat(['U'])
    .map(m => L.FACE_ORDER[map.indexOf(m[0])] + m.slice(1));
  const f = fixture({ app: true, scramble }), { get } = f;
  assert.equal(f.faceColours[L.FACE_INDEX.D], 'orange');
  const expected = LANG.t('coach.target.corners', { base: LANG.colour('orange') });
  assert.equal(get('coach-goal').textContent, expected);
  get('coach-again').onclick();
  assert.equal(get('coach-goal').textContent, expected);
  await f.advance();
  await f.advance(-1);
  assert.equal(get('coach-goal').textContent, expected);
});
