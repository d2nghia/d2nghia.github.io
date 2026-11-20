/**
 * The step guide: the seven stages drawn as cube pictures.
 *
 * Every row of pictures is generated, not drawn by hand. Each recipe's starting
 * cube is made by running the recipe backwards from a finished cube, so doing
 * the pictured turns in order always lands on the finished cube — the pictures
 * cannot drift out of step with the moves.
 */
(function () {
  'use strict';
  var L = window.CubeLib, V = window.CubeView;
  var $ = function (id) { return document.getElementById(id); };

  var MASKS = {
    bottom: function (f) { return f.face === 'D' || (f.face !== 'U' && f.row === 2); },
    twoLayers: function (f) { return f.face === 'D' || (f.face !== 'U' && f.row >= 1); },
    top: function (f) { return f.face === 'U'; },
    topRow: function (f) { return f.face === 'U' || (f.face !== 'D' && f.row === 0); },
    all: null
  };
  function maskFor(name) {
    var fn = MASKS[name];
    if (!fn) return null;
    return function (i) { return fn(L.FACELETS[i]); };
  }

  var LANG = window.CubeLang, t = LANG.t;

  /* Structure here, words in lang.js: each stage names the parts of the
   * dictionary it needs, so neither language can drift from the other. */
  var STAGES = [
    { key: 'cross', n: 1, mask: 'bottom', shapes: null,
      recipes: [{ id: 'petal', alg: 'F2' }, { id: 'gap', alg: 'D' }] },
    { key: 'corners', n: 2, mask: 'bottom', shapes: null,
      recipes: [{ id: 'right', alg: "R U R'" }, { id: 'front', alg: "F' U' F" }, { id: 'top', alg: "R U2 R' U' R U R'" }] },
    { key: 'belt', n: 3, mask: 'twoLayers', shapes: null,
      recipes: [{ id: 'right', alg: "U R U' R' U' F' U F" }, { id: 'left', alg: "U' L' U L U F U' F'" }] },
    { key: 'yellowCross', n: 4, mask: 'top',
      shapes: [
        { id: 'dot', cells: [0, 0, 0, 0, 1, 0, 0, 0, 0] },
        { id: 'L', cells: [0, 0, 0, 0, 1, 1, 0, 1, 0] },
        { id: 'line', cells: [0, 0, 0, 1, 1, 1, 0, 0, 0] }],
      recipes: [{ id: 'cross', alg: "F R U R' U' F'" }] },
    { key: 'yellowFace', n: 5, mask: 'top',
      shapes: [
        { id: 'one', cells: [0, 1, 0, 1, 1, 1, 1, 1, 0] },
        { id: 'none', cells: [0, 1, 0, 1, 1, 1, 0, 1, 0] },
        { id: 'two', cells: [1, 1, 0, 1, 1, 1, 0, 1, 1] }],
      recipes: [{ id: 'fish', alg: "R U R' U R U2 R'" }, { id: 'back', alg: "R U2 R' U' R U' R'" }] },
    { key: 'cornerPlace', n: 6, mask: 'topRow', shapes: null,
      recipes: [{ id: 'circle', alg: "R' F R' B2 R F' R' B2 R2" }, { id: 'back', alg: "R B' R F2 R' B R F2 R2" }] },
    { key: 'lastEdges', n: 7, mask: 'topRow', shapes: null,
      recipes: [{ id: 'circle', alg: "R U' R U R U R U' R' U' R2" }, { id: 'back', alg: "R2 U R U R' U' R' U' R' U R'" }] }
  ];

  /* ---------------- the shared cube at the top ---------------- */
  var view = V.create($('watch-cube'));
  var watch = { moves: [], i: 0, start: L.solvedState(), playing: false };
  function moveWords(m) { return t('move.' + m); }

  function loadWatch(title, start, moves) {
    watch.start = start; watch.moves = moves; watch.i = 0; watch.playing = false;
    view.set(start);
    $('watch-what').textContent = title;
    $('watch-word').textContent = t('steps.turns', { n: moves.length });
    $('watch').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function stepWatch() {
    if (view.busy() || watch.i >= watch.moves.length) return Promise.resolve(false);
    var m = watch.moves[watch.i++];
    $('watch-word').textContent = moveWords(m) + '   (' + watch.i + '/' + watch.moves.length + ')';
    return view.play(m).then(function () {
      if (watch.i >= watch.moves.length) $('watch-word').textContent = t('steps.done');
      return true;
    });
  }
  function playWatch() {
    if (watch.playing) return;
    if (watch.i >= watch.moves.length) { view.set(watch.start); watch.i = 0; }
    watch.playing = true;
    (function loop() {
      stepWatch().then(function (more) {
        if (!more || watch.i >= watch.moves.length) { watch.playing = false; return; }
        setTimeout(loop, 220);
      });
    })();
  }
  $('watch-play').onclick = playWatch;
  $('watch-step').onclick = function () { watch.playing = false; stepWatch(); };
  $('watch-reset').onclick = function () {
    watch.playing = false; watch.i = 0; view.set(watch.start);
    $('watch-word').textContent = watch.moves.length ? t('steps.back') : '';
  };

  /* ---------------- building a stage ---------------- */
  function flatFace(cells) {
    var g = document.createElement('div');
    g.className = 'grid3 flat';
    cells.forEach(function (v) {
      var d = document.createElement('div');
      d.style.background = v ? V.HEX.yellow : '#b9bfcc';
      g.appendChild(d);
    });
    return g;
  }

  function buildRecipe(stage, recipe) {
    var base = 'steps.' + stage.key + '.' + recipe.id;
    var moves = L.parse(recipe.alg);
    var start = L.applyMoves(L.solvedState(), L.inverse(moves));
    var block = document.createElement('div');
    block.className = 'recipe';

    var head = document.createElement('div');
    head.className = 'recipe-head';
    head.innerHTML = '<h3>' + t(base) + '</h3>';
    var letters = document.createElement('code');
    letters.className = 'letters-line';
    letters.textContent = recipe.alg;
    letters.hidden = !$('show-letters').checked;
    head.appendChild(letters);
    var watchBtn = document.createElement('button');
    watchBtn.className = 'btn ghost small';
    watchBtn.textContent = t('steps.watchthis');
    watchBtn.onclick = function () {
      loadWatch(t('steps.of', { n: stage.n }) + ' · ' + t(base), start, moves);
      playWatch();
    };
    head.appendChild(watchBtn);
    block.appendChild(head);

    var note = document.createElement('p');
    note.className = 'small muted';
    note.textContent = t(base + '.note');
    block.appendChild(note);

    var strip = document.createElement('div');
    strip.className = 'strip';
    var mask = maskFor(stage.mask);
    var state = start;
    moves.forEach(function (m, i) {
      strip.appendChild(V.figure(state, {
        size: moves.length > 8 ? 104 : 124, mask: mask, move: m, caption: (i + 1) + '.'
      }));
      state = L.applyMoves(state, [m]);
    });
    strip.appendChild(V.figure(state, { size: moves.length > 8 ? 104 : 124, mask: mask, caption: t('steps.donecap') }));
    block.appendChild(strip);
    return block;
  }

  function buildStage(stage) {
    var card = document.createElement('section');
    card.className = 'card stage-card';

    var top = document.createElement('div');
    top.className = 'stage-top';
    var words = document.createElement('div');
    words.innerHTML = '<p class="small muted">' + t('steps.of', { n: stage.n }) + '</p>' +
      '<h2>' + t('stage.' + stage.key + '.name') + '</h2>' +
      '<p style="margin-top:6px">' + t('stage.' + stage.key + '.goal') + '</p>' +
      '<p class="small muted" style="margin-top:8px">' + t('steps.' + stage.key + '.note') + '</p>';
    top.appendChild(words);
    var done = V.figure(L.solvedState(), { size: 132, mask: maskFor(stage.mask), caption: t('steps.finished') });
    top.appendChild(done);
    card.appendChild(top);

    if (stage.shapes) {
      var shapes = document.createElement('div');
      shapes.className = 'shapes';
      stage.shapes.forEach(function (s) {
        var item = document.createElement('div');
        item.className = 'shape';
        item.appendChild(flatFace(s.cells));
        var p = document.createElement('p');
        p.innerHTML = '<b>' + t('shape.' + s.id) + '</b><br><span class="small muted">' + t('shape.' + s.id + '.tell') + '</span>';
        item.appendChild(p);
        shapes.appendChild(item);
      });
      card.appendChild(shapes);
    }

    stage.recipes.forEach(function (r) { card.appendChild(buildRecipe(stage, r)); });
    return card;
  }

  var host = $('stages');
  function buildAll() {
    host.innerHTML = '';
    STAGES.forEach(function (stage) { host.appendChild(buildStage(stage)); });
  }
  LANG.apply(document);
  buildAll();
  $('lang-switch').onclick = function () { LANG.toggle(); };
  LANG.onChange(function () {
    buildAll();
    $('watch-word').textContent = '';
    $('show-letters').checked = false;
  });

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  $('show-letters').onchange = function () {
    var on = this.checked;
    Array.prototype.forEach.call(document.querySelectorAll('.letters-line'), function (el) { el.hidden = !on; });
  };
})();
