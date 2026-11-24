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
  var selected = {}, expanded = { cross: true }, cards = {}, active = 'cross';
  var faces = ['D', 'U', 'F', 'R', 'B', 'L'], centres = {}, brush = 'white', statusMessage = '';
  var centreCube = null;
  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
  function diagram(markup, className) { var el = node('span', className); el.innerHTML = markup; return el; }
  function faceName(face) { return t('guide.face.' + face); }
  function turnToFace(face) {
    centreCube.lookFace(face, !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  /** Paint one centre with the colour the pencil is holding. */
  function paintCentre(face) {
    var result = G.assignCentre(centres, face, brush);
    centres = result.centres;
    statusMessage = result.swappedFace ? t('guide.centres.swap', { first: faceName(face).toLowerCase(), second: faceName(result.swappedFace).toLowerCase() }) : '';
    colourScheme = G.schemeForCentres(centres);
    buildCentrePicker(); build();
  }
  function syncCentreCube() {
    var L = window.CubeLib;
    var names = Array.from({ length: 54 }, function (_, i) { return i % 9 === 4 ? centres[L.FACE_ORDER[Math.floor(i / 9)]] || null : null; });
    centreCube.setNames(names);
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
    centreCube = window.CubeView.create($('guide-centre-cube'), null, { glass: true, singlePaint: true });
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
    document.querySelectorAll('[data-centre-colour]').forEach(function (button) {
      var on = button.dataset.centreColour === colour;
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? '✓' : '';
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
      palette.appendChild(button);
    });
    setBrush(brush);
    $('guide-centre-reset').hidden = count === 0;
    syncCentreCube();
  }
  function showStage(key) {
    var card = cards[key]; card.load(); card.el.open = true; expanded[key] = true; active = key; labelNav();
    requestAnimationFrame(function () { card.el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); });
  }
  function labelNav() {
    document.querySelectorAll('[data-guide-stage]').forEach(function (button) {
      button.setAttribute('aria-expanded', String(!!expanded[button.dataset.guideStage]));
      if (button.dataset.guideStage === active) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
  }
  function buildStage(stage, index) {
    var card = node('details', 'stage-card guide-stage'); card.id = 'step-' + stage.key;
    var summary = node('summary', 'guide-summary'); summary.appendChild(node('span', 'guide-number', index + 1));
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
        var next = node('button', 'linkish guide-next', t('guide.next', { n: index + 2 })); next.type = 'button';
        next.onclick = function () { showStage(G.STAGES[index + 1].key); }; body.appendChild(next);
      }
      choose(stage.recipes.find(function (recipe) { return recipe.id === selected[stage.key]; }) || stage.recipes[0]);
    }
    cards[stage.key] = { el: card, load: load };
    var wasOpen = !!expanded[stage.key];
    card.ontoggle = function () {
      if (card.open === wasOpen) return;
      wasOpen = card.open; expanded[stage.key] = card.open;
      if (card.open) { active = stage.key; load(); } labelNav();
    };
    if (expanded[stage.key]) { load(); card.open = true; } return card;
  }
  function build() {
    $('guide-nav').hidden = !colourScheme;
    $('stages').hidden = !colourScheme;
    $('guide-orientation').hidden = !colourScheme;
    if (!colourScheme) return;
    $('guide-configured-cube').innerHTML = G.cubeSVG(window.CubeLib.solvedState(), null, null, colourScheme.colours);
    $('guide-configured-note').textContent = t('guide.centres.base', { colour: LANG.colour(colourScheme.base) });
    $('stages').innerHTML = ''; $('guide-nav').innerHTML = ''; cards = {};
    $('guide-nav').setAttribute('aria-label', t('steps.title'));
    G.STAGES.forEach(function (stage, i) {
      var button = node('button', '', i + 1); button.type = 'button'; button.dataset.guideStage = stage.key;
      button.setAttribute('aria-controls', 'step-' + stage.key); button.setAttribute('aria-label', (i + 1) + '. ' + t('guide.' + stage.key + '.title'));
      button.onclick = function () { showStage(stage.key); }; $('guide-nav').appendChild(button); $('stages').appendChild(buildStage(stage, i));
    }); labelNav();
  }
  $('guide-start').onclick = function () { showStage(active); };
  $('guide-centre-reset').onclick = function () {
    centres = {}; colourScheme = null; statusMessage = '';
    selected = {}; expanded = { cross: true }; active = 'cross';
    centreCube.look(-22, -32, !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    buildCentrePicker(); build();
  };
  LANG.apply(document); initCentreCube(); buildCentrePicker(); build();
  $('lang-switch').onclick = function () { LANG.toggle(); };
  LANG.onChange(function () { statusMessage = ''; buildCentrePicker(); build(); });
})();
