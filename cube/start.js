/**
 * The chooser: two ways in, and nothing else. Guided solving lives on
 * solve.html and the step guide on steps.html, so this page only has to draw
 * the two pictures, offer the language switch, and hand over any progress link
 * that was shared back when both pages were one.
 */
(function () {
  'use strict';
  var L = window.CubeLib;
  var LANG = window.CubeLang;
  var t = LANG.t;
  var $ = function (id) { return document.getElementById(id); };

  /* A lesson used to be restored here. Such links are still handed out, so send
   * them on to the page that can open them, hash and all, without adding a step
   * to the child's history. */
  function forwardProgressLink() {
    var hash = window.location.hash || '';
    if (!hash) return false;
    var params = new URLSearchParams(hash.slice(1));
    if (!params.has('p') && !params.has('v') && !params.has('cube')) return false;
    var url = 'solve.html' + window.location.search + hash;
    if (window.location.replace) window.location.replace(url);
    else window.location.href = url;
    return true;
  }

  function renderModePreviews() {
    // Static illustrations drawn with the same cube renderer as the lesson.
    // Nothing here starts a lesson or touches the child's saved cube.
    $('guided-preview').appendChild(window.CubeView.figure(L.applyMoves(L.solvedState(), L.parse('R U F')), { size: 155, move: 'R' }));
    ['cross', 'corners', 'belt', 'yellowCross', 'yellowFace', 'cornerPlace', 'lastEdges'].forEach(function (stage, n) {
      var step = document.createElement('span');
      step.className = 'mode-sheet-step';
      var face = document.createElement('span');
      face.className = 'mode-mini-face';
      for (var i = 0; i < 9; i++) {
        var cell = document.createElement('i');
        if ([1, 3, 4, 5, 7].indexOf(i) >= 0 || n > 3) cell.className = 'is-coloured';
        face.appendChild(cell);
      }
      var label = document.createElement('small');
      label.setAttribute('data-t', 'stage.' + stage + '.short');
      label.textContent = t('stage.' + stage + '.short');
      step.appendChild(face); step.appendChild(label);
      $('instructions-preview').appendChild(step);
    });
  }

  if (forwardProgressLink()) return;
  LANG.apply(document);
  $('lang-switch').onclick = function () { LANG.toggle(); };
  renderModePreviews();
})();
