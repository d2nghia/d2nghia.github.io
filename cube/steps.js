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
  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }
  function diagram(markup, className) { var el = node('span', className); el.innerHTML = markup; return el; }
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
    ['base', 'top', 'front'].forEach(function (role) {
      $('guide-' + role + '-dot').style.background = G.HEX[colourScheme[role]];
      $('guide-' + role + '-name').textContent = LANG.colour(colourScheme[role]);
    });
    $('stages').innerHTML = ''; $('guide-nav').innerHTML = ''; cards = {};
    $('guide-nav').setAttribute('aria-label', t('steps.title'));
    G.STAGES.forEach(function (stage, i) {
      var button = node('button', '', i + 1); button.type = 'button'; button.dataset.guideStage = stage.key;
      button.setAttribute('aria-controls', 'step-' + stage.key); button.setAttribute('aria-label', (i + 1) + '. ' + t('guide.' + stage.key + '.title'));
      button.onclick = function () { showStage(stage.key); }; $('guide-nav').appendChild(button); $('stages').appendChild(buildStage(stage, i));
    }); labelNav();
  }
  document.querySelectorAll('input[name="guide-base"]').forEach(function (input) {
    input.onchange = function () {
      if (!input.checked) return;
      colourScheme = G.orientation(input.value);
      build();
    };
  });
  LANG.apply(document); build(); $('lang-switch').onclick = function () { LANG.toggle(); }; LANG.onChange(build);
})();
