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

  var STAGES = [
    {
      n: 1, name: 'The white cross', mask: 'bottom',
      goal: 'Four white edge pieces go round the white middle, on the bottom. Each one must also match the colour of the side it touches.',
      note: 'This step has no magic move — you can work it out by pushing pieces about. These two turns are all you need.',
      recipes: [
        { name: 'Drop a white petal', alg: 'F2', note: 'White sticker on the top, sitting above its own colour? Spin that whole side twice and it drops into place.' },
        { name: 'Bring the gap round', alg: 'D', note: 'Turn the bottom layer to move an empty slot to the front.' }
      ]
    },
    {
      n: 2, name: 'The white corners', mask: 'bottom',
      goal: 'Each white corner slides under its own two colours. When all four are in, the whole bottom layer is finished.',
      note: 'Put the corner in the top layer, right above the gap it belongs in, then use the recipe that matches where its white sticker points.',
      recipes: [
        { name: 'White points right', alg: "R U R'", note: 'Three turns and it drops in.' },
        { name: 'White points at you', alg: "F' U' F", note: 'The mirror of the one above.' },
        { name: 'White points up', alg: "R U2 R' U' R U R'", note: 'First it gets kicked out, then it comes back in the right way round.' }
      ]
    },
    {
      n: 3, name: 'The middle belt', mask: 'twoLayers',
      goal: 'Four edge pieces slide into the middle ring. Two layers done, one to go.',
      note: 'Find an edge in the top layer with no yellow on it. Turn the top until its front colour matches the middle in front of it, then pick a side.',
      recipes: [
        { name: 'Send it right', alg: "U R U' R' U' F' U F", note: 'For an edge that has to go into the slot on the right.' },
        { name: 'Send it left', alg: "U' L' U L U F U' F'", note: 'Same thing, mirrored, for the slot on the left.' }
      ]
    },
    {
      n: 4, name: 'The yellow cross', mask: 'top',
      goal: 'Make a yellow plus sign on the top. Only the top face matters here — ignore the sides.',
      note: 'Look at the yellow side and find your shape below. Turn the top until your shape sits the same way as the picture, then do the move.',
      shapes: [
        { cells: [0, 0, 0, 0, 1, 0, 0, 0, 0], label: 'Just a dot', tell: 'Do the move three times.' },
        { cells: [0, 0, 0, 0, 1, 1, 0, 1, 0], label: 'An L', tell: 'Point the L at the top-left corner, then do it twice.' },
        { cells: [0, 0, 0, 1, 1, 1, 0, 0, 0], label: 'A line', tell: 'Lay the line flat, left to right, then do it once.' }
      ],
      recipes: [
        { name: 'The cross move', alg: "F R U R' U' F'", note: 'Six turns. This is the one to learn by heart first.' }
      ]
    },
    {
      n: 5, name: 'The whole yellow face', mask: 'top',
      goal: 'Twist the top corners until the entire top side is yellow. The cross you just made stays.',
      note: 'Count the yellow corners on top. Hold the cube as the picture says, do the fish move, then count again — it changes every time until all four are up.',
      shapes: [
        { cells: [0, 1, 0, 1, 1, 1, 1, 1, 0], label: 'One corner yellow', tell: 'Put that corner at the front-left, then do the fish move once.' },
        { cells: [0, 1, 0, 1, 1, 1, 0, 1, 0], label: 'No corner yellow', tell: 'Do the fish move from any angle. You will land on one of the other shapes.' },
        { cells: [1, 1, 0, 1, 1, 1, 0, 1, 1], label: 'Two corners yellow', tell: 'Do the fish move once, then look again.' }
      ],
      recipes: [
        { name: 'The fish move', alg: "R U R' U R U2 R'", note: 'Seven turns. Notice it is the corner move from step 2 with a bit extra.' },
        { name: 'The fish, backwards', alg: "R U2 R' U' R U' R'", note: 'Useful when the fish move would take you the long way round.' }
      ]
    },
    {
      n: 6, name: 'Corners into their seats', mask: 'topRow',
      goal: 'Shuffle the top corners until each one sits between its own two colours. The yellow stays on top the whole time.',
      note: 'This move keeps one corner still and sends the other three round in a circle. Do it once, look, and do it again if two corners are still swapped.',
      recipes: [
        { name: 'Corner circle', alg: "R' F R' B2 R F' R' B2 R2", note: 'Nine turns, and it never touches the layers you already finished.' },
        { name: 'Corner circle, the other way', alg: "R B' R F2 R' B R F2 R2", note: 'The same circle, going backwards.' }
      ]
    },
    {
      n: 7, name: 'The last four edges', mask: 'topRow',
      goal: 'The last four edges slide round until every side of the cube is one colour. This is the finish.',
      note: 'One side will usually already match. Hold the cube with that side at the back, and the other three edges go round.',
      recipes: [
        { name: 'Edge circle', alg: "R U' R U R U R U' R' U' R2", note: 'Eleven turns. Go slowly — it is the longest one, and the last.' },
        { name: 'Edge circle, the other way', alg: "R2 U R U R' U' R' U' R' U R'", note: 'When the three edges need to go round the other way.' }
      ]
    }
  ];

  /* ---------------- the shared cube at the top ---------------- */
  var view = V.create($('watch-cube'));
  var watch = { moves: [], i: 0, start: L.solvedState(), playing: false };
  var WORDS = {
    U: 'Top row goes left', "U'": 'Top row goes right', U2: 'Top row, half turn',
    D: 'Bottom row goes right', "D'": 'Bottom row goes left', D2: 'Bottom row, half turn',
    R: 'Right side goes up', "R'": 'Right side goes down', R2: 'Right side, half turn',
    L: 'Left side goes down', "L'": 'Left side goes up', L2: 'Left side, half turn',
    F: 'Front face spins right', "F'": 'Front face spins left', F2: 'Front face, half turn',
    B: 'Back layer top goes left', "B'": 'Back layer top goes right', B2: 'Back layer, half turn'
  };

  function loadWatch(title, start, moves) {
    watch.start = start; watch.moves = moves; watch.i = 0; watch.playing = false;
    view.set(start);
    $('watch-what').textContent = title;
    $('watch-word').textContent = moves.length + ' turns — press Play or Step';
    $('watch').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function stepWatch() {
    if (view.busy() || watch.i >= watch.moves.length) return Promise.resolve(false);
    var m = watch.moves[watch.i++];
    $('watch-word').textContent = (WORDS[m] || m) + '   (' + watch.i + '/' + watch.moves.length + ')';
    return view.play(m).then(function () {
      if (watch.i >= watch.moves.length) $('watch-word').textContent = 'Done — that is the whole move.';
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
    $('watch-word').textContent = watch.moves.length ? 'Back to the start.' : '';
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
    var moves = L.parse(recipe.alg);
    var start = L.applyMoves(L.solvedState(), L.inverse(moves));
    var block = document.createElement('div');
    block.className = 'recipe';

    var head = document.createElement('div');
    head.className = 'recipe-head';
    head.innerHTML = '<h3>' + recipe.name + '</h3>';
    var letters = document.createElement('code');
    letters.className = 'letters-line';
    letters.textContent = recipe.alg;
    letters.hidden = !$('show-letters').checked;
    head.appendChild(letters);
    var watchBtn = document.createElement('button');
    watchBtn.className = 'btn ghost small';
    watchBtn.textContent = 'Watch this ▶';
    watchBtn.onclick = function () {
      loadWatch('Step ' + stage.n + ' · ' + recipe.name, start, moves);
      playWatch();
    };
    head.appendChild(watchBtn);
    block.appendChild(head);

    if (recipe.note) {
      var note = document.createElement('p');
      note.className = 'small muted';
      note.textContent = recipe.note;
      block.appendChild(note);
    }

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
    strip.appendChild(V.figure(state, { size: moves.length > 8 ? 104 : 124, mask: mask, caption: 'done ✓' }));
    block.appendChild(strip);
    return block;
  }

  function buildStage(stage) {
    var card = document.createElement('section');
    card.className = 'card stage-card';

    var top = document.createElement('div');
    top.className = 'stage-top';
    var words = document.createElement('div');
    words.innerHTML = '<p class="small muted">Step ' + stage.n + ' of 7</p><h2>' + stage.name + '</h2>' +
      '<p style="margin-top:6px">' + stage.goal + '</p>' +
      (stage.note ? '<p class="small muted" style="margin-top:8px">' + stage.note + '</p>' : '');
    top.appendChild(words);
    var done = V.figure(L.solvedState(), { size: 132, mask: maskFor(stage.mask), caption: 'what finished looks like' });
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
        p.innerHTML = '<b>' + s.label + '</b><br><span class="small muted">' + s.tell + '</span>';
        item.appendChild(p);
        shapes.appendChild(item);
      });
      card.appendChild(shapes);
    }

    stage.recipes.forEach(function (r) { card.appendChild(buildRecipe(stage, r)); });
    return card;
  }

  var host = $('stages');
  STAGES.forEach(function (stage) { host.appendChild(buildStage(stage)); });

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  $('show-letters').onchange = function () {
    var on = this.checked;
    Array.prototype.forEach.call(document.querySelectorAll('.letters-line'), function (el) { el.hidden = !on; });
  };
})();
