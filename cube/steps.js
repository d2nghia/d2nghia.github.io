/** Seven manual stages, with lightweight arrow diagrams built on demand. */
(function () {
  'use strict';
  var G = window.CubeStepDiagrams, LANG = window.CubeLang, colourScheme = null;
  function t(key, vars) {
    var colours = {};
    if (colourScheme) {
      ['base', 'top', 'front'].forEach(function (role) {
        colours[role] = LANG.colour(colourScheme[role]);
        colours[role + 'Title'] = colours[role].charAt(0).toUpperCase() + colours[role].slice(1);
      });
    }
    return LANG.t(key, Object.assign(colours, vars || {}));
  }
  var $ = function (id) { return document.getElementById(id); };
  // Getting the cube ready is two steps like any other, first in the same list.
  var PREP = ['centres', 'base'];
  // Steps arrive one at a time. Seven cards unrolling at once is a wall of
  // pictures; the next one shows up when the child reaches the one before it.
  var revealed = 1;
  var selected = {}, expanded = { centres: true }, cards = {}, active = 'centres';
  var faces = ['D', 'U', 'F', 'R', 'B', 'L'], centres = {}, brush = 'white', statusMessage = '';
  // The colour the child wants to solve first. It is theirs to choose: the side
  // they happened to paint last is no reason to start there.
  var baseChoice = null;
  var centreCube = null, hashWritten = null, hashTimer = 0;
  // While the page is scrolling itself to a step, that step is the one being
  // read, whatever happens to pass through view on the way.
  var spyUntil = 0;
  function pauseSpy() { spyUntil = Date.now() + 900; }
  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
  /** Every side has its centre colour: the cube in hand is described. */
  function painted() { return faces.every(function (face) { return !!centres[face]; }); }
  function diagram(markup, className) { var el = node('span', className); el.innerHTML = markup; return el; }
  function faceName(face) { return t('guide.face.' + face); }
  function turnToFace(face) {
    centreCube.lookFace(face, !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  /** Paint one centre with the colour the pencil is holding. */
  function paintCentre(face) {
    var wasReady = painted();
    var result = G.assignCentre(centres, face, brush);
    centres = result.centres;
    statusMessage = result.swappedFace ? t('guide.centres.swap', { first: faceName(face).toLowerCase(), second: faceName(result.swappedFace).toLowerCase() }) : '';
    refreshScheme();
    buildCentrePicker(); build(); syncHash();
    // The cube is complete: the choice of starting colour is what comes next,
    // and it is the only thing that comes next.
    if (!wasReady && painted()) { reveal(2); showStage('base'); }
  }
  /** The guide follows the chosen starting colour, with the cube turned to it. */
  function refreshScheme() {
    if (!painted()) { colourScheme = null; baseChoice = null; return; }
    var owned = faces.some(function (face) { return centres[face] === baseChoice; });
    // No colour is chosen on the child's behalf. Until one is picked there is no
    // scheme, and so no steps: the guide is drawn around the starting colour.
    if (!owned) baseChoice = null;
    colourScheme = baseChoice ? G.schemeWithBase(centres, baseChoice, colourScheme && colourScheme.front) : null;
  }
  function buildBasePicker() {
    var host = $('guide-base');
    host.innerHTML = '';
    G.NAMES.forEach(function (colour) {
      if (!faces.some(function (face) { return centres[face] === colour; })) return;
      var button = node('button', 'sw-' + colour);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(colour === baseChoice));
      button.setAttribute('aria-label', LANG.colour(colour));
      button.title = LANG.colour(colour);
      button.onclick = function () {
        baseChoice = colour; refreshScheme(); reveal(3); build();
        // Choosing is what opens the guide: the steps only exist once there is a
        // colour to draw them in.
        showStage(G.STAGES[0].key);
      };
      host.appendChild(button);
    });
  }
  function syncCentreCube() {
    var L = window.CubeLib;
    var names = Array.from({ length: 54 }, function (_, i) { return i % 9 === 4 ? centres[L.FACE_ORDER[Math.floor(i / 9)]] || null : null; });
    centreCube.setNames(names);
    // A side round the back cannot show its own "?", so a curved arrow outside
    // the cube points at every middle square still waiting for a colour.
    centreCube.pointAt(faces.filter(function (face) { return !centres[face]; })
      .map(function (face) { return L.FACE_INDEX[face] * 9 + 4; }));
    $('guide-centre-cube').setAttribute('aria-label', t('guide.centres.cube'));
    document.querySelectorAll('#guide-centre-cube [data-facelet]').forEach(function (sticker) {
      var index = Number(sticker.dataset.facelet), face = L.FACE_ORDER[Math.floor(index / 9)];
      var centre = index % 9 === 4;
      sticker.classList.toggle('guide-cube-centre', centre);
      if (!centre) return;
      sticker.setAttribute('aria-label', faceName(face) + ': ' + (centres[face] ? LANG.colour(centres[face]) : t('guide.centres.empty')));
      sticker.classList.toggle('is-empty-centre', !centres[face]);
      var marker = sticker.querySelector('.guide-centre-question');
      if (!marker) {
        marker = node('span', 'guide-centre-question', '?');
        marker.setAttribute('aria-hidden', 'true'); sticker.appendChild(marker);
      }
      marker.hidden = !!centres[face];
      if (sticker.dataset.centreReady) return;
      // Keyboard path: the six centres are buttons in their own right, and the
      // cube turns to whichever one is focused so the child can see it.
      sticker.dataset.centreReady = '1';
      sticker.tabIndex = 0;
      sticker.setAttribute('role', 'button');
      sticker.addEventListener('focus', function () { turnToFace(face); });
      sticker.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); paintCentre(face);
      });
    });
  }
  function rotatePicker(direction) {
    var view = centreCube.angles();
    var rx = view.rx + (direction === 'up' ? -90 : direction === 'down' ? 90 : 0);
    var ry = view.ry + (direction === 'left' ? -90 : direction === 'right' ? 90 : 0);
    centreCube.look(rx, ry, !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function initCentreCube() {
    centreCube = window.CubeView.create($('guide-centre-cube'), null, { singlePaint: true });
    centreCube.onSticker(function (index) {
      // Only the middle square of a side carries a centre colour.
      if (index % 9 !== 4) {
        var nudge = t('guide.centres.middle');
        if (statusMessage !== nudge) { statusMessage = nudge; buildCentrePicker(); }
        return;
      }
      paintCentre(window.CubeLib.FACE_ORDER[Math.floor(index / 9)]);
    });
    $('guide-centre-cube').addEventListener('keydown', function (event) {
      var direction = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key];
      if (!direction || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault(); rotatePicker(direction);
    });
  }
  function setBrush(colour) {
    brush = colour;
    $('guide-centre-cube').style.cursor = window.CubeView.pencilCursor(colour);
    // The ring already shows which colour is in hand; the tick belongs to the
    // colours that are on the cube.
    document.querySelectorAll('[data-centre-colour]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.centreColour === colour));
    });
  }
  function buildCentrePicker() {
    var palette = $('guide-centre-palette');
    palette.innerHTML = '';
    var count = faces.filter(function (face) { return !!centres[face]; }).length;
    $('guide-face-count').textContent = t('guide.centres.count', { n: count });
    $('guide-face-status').textContent = statusMessage;
    $('guide-face-prompt').textContent = t('guide.centres.prompt');
    G.NAMES.forEach(function (colour) {
      var button = node('button', 'sw-' + colour), owner = faces.find(function (face) { return centres[face] === colour; });
      button.type = 'button'; button.dataset.centreColour = colour;
      button.setAttribute('aria-label', LANG.colour(colour) + (owner ? ' · ' + faceName(owner) : ''));
      button.title = LANG.colour(colour);
      button.onclick = function () { setBrush(colour); };
      // A tick marks a colour that is already on the cube. It stays pickable:
      // picking it again is how a child moves it to another side.
      button.textContent = owner ? '✓' : '';
      palette.appendChild(button);
    });
    setBrush(brush);
    $('guide-centre-reset').hidden = count === 0;
    syncCentreCube();
  }
  /* The address bar carries the whole state, so a link puts a child — or
   * whoever is working on the page — back on the same step with the same cube,
   * instead of painting six centres again. It is replaced, never pushed: the
   * back button still leaves the page rather than walking the steps backwards. */
  function syncHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      var keys = stepKeys();
      var code = G.encodeGuide({
        centres: centres, base: baseChoice,
        open: keys.map(function (key, i) { return expanded[key] ? i + 1 : 0; }),
        step: keys.indexOf(active) + 1
      });
      var hash = code ? '#g=' + code : '';
      if (hash === hashWritten) return;
      hashWritten = hash;
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + hash);
      else if (hash) location.hash = hash;
    }, 150);
  }
  function readHash() {
    var match = /^#g=([0-9a-z]{1,8})$/.exec(location.hash);
    var state = match && G.decodeGuide(match[1]);
    if (!state) return false;
    hashWritten = location.hash;
    centres = state.centres;
    baseChoice = state.base;
    refreshScheme();
    var keys = stepKeys(), key = keys[state.step - 1];
    // A cube that is already coloured has earned its way past step 1, and a
    // link to step 7 has earned everything before it. Reaching a step brings
    // out the one after it here as much as on the page, or a reload at step 4
    // would have nowhere to go next.
    var reached = Math.max.apply(null, [state.step].concat(state.open));
    revealed = colourScheme ? Math.max(2, Math.min(reached + 1, keys.length)) : painted() ? 2 : 1;
    // Steps the child had open stay open; the rest stay shut. A step the link
    // cannot reach - no cube, or no starting colour - is not one of them.
    expanded = {};
    state.open.forEach(function (step) {
      if (keys[step - 1] && step <= revealed) expanded[keys[step - 1]] = true;
    });
    if (key && keys.indexOf(key) < revealed) active = key;
    PREP.forEach(function (prep) { $('step-' + prep).open = !!expanded[prep]; });
    return true;
  }
  function stepKeys() {
    return PREP.concat(G.STAGES.map(function (stage) { return stage.key; }));
  }
  /** Let the first `count` steps be seen, and say which ones are new. */
  function reveal(count) {
    if (count <= revealed) return;
    revealed = Math.min(count, stepKeys().length);
    stepKeys().forEach(function (key, i) {
      var card = cards[key] && cards[key].el;
      if (!card || i >= revealed || !card.hidden) return;
      card.hidden = false;
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        card.classList.add('is-arriving');
        card.addEventListener('animationend', function () { card.classList.remove('is-arriving'); }, { once: true });
      }
    });
    buildNav();
  }
  function stageTitle(key) {
    return key === 'centres' ? t('guide.centres.title') : key === 'base' ? t('guide.centres.pick') : t('guide.' + key + '.title');
  }
  function showStage(key) {
    var card = cards[key];
    if (!card) return;
    card.load(); card.el.open = true; expanded[key] = true; active = key; labelNav(); syncHash();
    pauseSpy();
    requestAnimationFrame(function () {
      pauseSpy();
      card.el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
  }
  function labelNav() {
    document.querySelectorAll('[data-guide-stage]').forEach(function (button) {
      var key = button.dataset.guideStage;
      button.setAttribute('aria-expanded', String(!!expanded[key]));
      if (key === active) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
  }
  /** One rail button per step, the two preparation ones included. */
  function buildNav() {
    var nav = $('guide-nav');
    nav.innerHTML = '';
    nav.setAttribute('aria-label', t('guide.nav'));
    var keys = PREP.concat(G.STAGES.map(function (stage) { return stage.key; }));
    keys.forEach(function (key, i) {
      var button = node('button', PREP.indexOf(key) >= 0 ? 'is-prep' : '', i + 1);
      button.type = 'button';
      button.dataset.guideStage = key;
      button.setAttribute('aria-controls', 'step-' + key);
      button.setAttribute('aria-label', (i + 1) + '. ' + stageTitle(key));
      button.title = stageTitle(key);
      // A step nobody has reached yet is not somewhere to jump to.
      button.disabled = i >= revealed;
      button.onclick = function () { showStage(key); };
      nav.appendChild(button);
    });
    labelNav();
  }
  /** Follow the reading as it scrolls: the step in view is the one marked. */
  function watchScroll() {
    if (typeof IntersectionObserver === 'undefined') return;
    var seen = new Map();
    var observer = new IntersectionObserver(function (entries) {
      if (Date.now() < spyUntil) return;
      entries.forEach(function (entry) { seen.set(entry.target, entry); });
      // Cards are rebuilt when the colours change; forget the ones that went.
      seen.forEach(function (entry, card) {
        if (!card.isConnected) { observer.unobserve(card); seen.delete(card); }
      });
      var top = null;
      seen.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        if (!top || entry.boundingClientRect.top < top.boundingClientRect.top) top = entry;
      });
      if (!top || !top.target.id) return;
      active = top.target.id.replace('step-', '');
      labelNav(); syncHash();
    }, { rootMargin: '-72px 0px -55% 0px' });
    return function (card) { observer.observe(card); };
  }
  /** @param index its place among the solving stages; @param number what the child sees */
  function buildStage(stage, index, number) {
    var card = node('details', 'stage-card guide-stage'); card.id = 'step-' + stage.key;
    var summary = node('summary', 'guide-summary'); summary.appendChild(node('span', 'guide-number', number));
    var heading = node('span', 'guide-heading'); heading.appendChild(node('h2', '', t('guide.' + stage.key + '.title'))); heading.appendChild(node('small', '', t('guide.goal'))); summary.appendChild(heading);
    summary.appendChild(diagram(G.goalSVG(stage.key, colourScheme.colours), 'guide-goal'));
    var chevron = node('span', 'guide-chevron', '⌄'); chevron.setAttribute('aria-hidden', 'true'); summary.appendChild(chevron); card.appendChild(summary);
    var body = node('div', 'guide-body'), loaded = false; card.appendChild(body);
    function load() {
      if (loaded) return; loaded = true;
      body.appendChild(node('p', 'guide-setup', t('guide.' + stage.key + '.setup')));
      if (stage.key === 'yellowCross') {
        var patterns = node('div', 'guide-patterns');
        [[4], [1, 3, 4], [3, 4, 5], [1, 3, 4, 5, 7]].forEach(function (on, n) {
          var chip = diagram(G.faceSVG(Array.from({ length: 9 }, function (_, i) { return on.indexOf(i) >= 0; }), colourScheme.colours[0]), 'guide-pattern');
          chip.appendChild(node('small', '', t('guide.pattern.' + ['dot', 'L', 'line', 'cross'][n])));
          if (n) patterns.appendChild(node('span', 'guide-pattern-next', '→')); patterns.appendChild(chip);
        }); body.appendChild(patterns);
      }
      var cases = node('div', 'guide-cases'); cases.setAttribute('role', 'group'); cases.setAttribute('aria-label', t('guide.case'));
      var strip = node('ol', 'guide-sequence'); strip.setAttribute('aria-label', t('guide.sequence'));
      var help = node('details', 'guide-help'); help.appendChild(node('summary', '', t('guide.help'))); help.appendChild(node('p', '', t('steps.' + stage.key + '.note')));
      var caseNote = node('p'); help.appendChild(caseNote); var notation = node('code'); help.appendChild(notation);
      function choose(recipe) {
        selected[stage.key] = recipe.id;
        Array.prototype.forEach.call(cases.children, function (button) { button.setAttribute('aria-pressed', String(button.dataset.case === recipe.id)); });
        strip.innerHTML = '';
        G.lesson(recipe).forEach(function (frame, n) {
          var item = node('li', 'guide-frame' + (frame.move ? '' : ' is-result'));
          item.appendChild(diagram(G.cubeSVG(frame.state, frame.move, null, colourScheme.colours), 'guide-cube'));
          item.appendChild(node('span', 'guide-frame-label', frame.move ? String(n + 1) : t('guide.result')));
          if (frame.move) item.appendChild(node('span', 'sr-only', t('move.' + frame.move))); strip.appendChild(item);
        });
        caseNote.textContent = t('steps.' + stage.key + '.' + recipe.id + '.note'); notation.textContent = recipe.alg;
      }
      stage.recipes.forEach(function (recipe) {
        var button = node('button', 'guide-case', t('steps.' + stage.key + '.' + recipe.id)); button.type = 'button'; button.dataset.case = recipe.id;
        button.onclick = function () { choose(recipe); }; cases.appendChild(button);
      });
      if (stage.recipes.length > 1) body.appendChild(cases);
      body.appendChild(strip); body.appendChild(help);
      if (index < G.STAGES.length - 1) {
        var next = node('button', 'linkish guide-next', t('guide.next', { n: number + 1 })); next.type = 'button';
        next.onclick = function () { showStage(G.STAGES[index + 1].key); }; body.appendChild(next);
      }
      choose(stage.recipes.find(function (recipe) { return recipe.id === selected[stage.key]; }) || stage.recipes[0]);
    }
    cards[stage.key] = { el: card, load: load };
    var wasOpen = !!expanded[stage.key];
    card.ontoggle = function () {
      if (card.open === wasOpen) return;
      wasOpen = card.open; expanded[stage.key] = card.open;
      if (card.open) { active = stage.key; load(); reveal(number + 1); } labelNav(); syncHash();
    };
    if (expanded[stage.key]) { load(); card.open = true; } return card;
  }
  function build() {
    // Nothing after step 1 exists until the cube has all six centre colours:
    // the steps are drawn in the child's own colours, and there are none yet.
    if (painted()) {
      $('guide-configured-cube').innerHTML = colourScheme ? G.cubeSVG(window.CubeLib.solvedState(), null, null, colourScheme.colours) : '';
      $('guide-configured-note').textContent = colourScheme
        ? t('guide.centres.base', { colour: LANG.colour(colourScheme.base) })
        : t('guide.centres.choose');
      buildBasePicker();
    }
    cards = {};
    PREP.forEach(function (key) {
      var card = $('step-' + key);
      cards[key] = { el: card, load: function () {} };
      if (observe) observe(card);
      card.ontoggle = function () { expanded[key] = card.open; labelNav(); syncHash(); };
    });
    $('solving').innerHTML = '';
    if (colourScheme) {
      G.STAGES.forEach(function (stage, i) {
        var card = buildStage(stage, i, i + 1 + PREP.length);
        $('solving').appendChild(card);
        if (observe) observe(card);
      });
    }
    stepKeys().forEach(function (key, i) {
      var card = cards[key] && cards[key].el;
      if (card) card.hidden = i >= revealed;
    });
    buildNav();
  }
  $('guide-centre-reset').onclick = function () {
    centres = {}; colourScheme = null; statusMessage = ''; baseChoice = null;
    selected = {}; expanded = { centres: true }; active = 'centres'; revealed = 1;
    $('step-centres').open = true; $('step-base').open = false;
    syncHash();
    centreCube.look(-22, -32, !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    buildCentrePicker(); build();
  };
  var observe = watchScroll();
  LANG.apply(document); initCentreCube();
  var linked = readHash();
  buildCentrePicker(); build();
  if (linked && cards[active] && active !== 'centres') {
    pauseSpy();
    cards[active].load();
    cards[active].el.scrollIntoView({ block: 'start' });
  }
  // A link pasted into the page that is already open counts as much as one
  // followed from outside.
  window.addEventListener('hashchange', function () {
    if (location.hash === hashWritten || !readHash()) return;
    buildCentrePicker(); build();
  });
  $('lang-switch').onclick = function () { LANG.toggle(); };
  LANG.onChange(function () { statusMessage = ''; buildCentrePicker(); build(); });
})();
