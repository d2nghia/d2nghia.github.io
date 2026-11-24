/**
 * Rebuild the sample links in this folder.
 *
 *   node cube/samples/generate.js
 *
 * Every sample is a plain redirect to ../index.html with a version 1 progress
 * hash (#v=1&cube=...&view=capture), so the cube arrives already coloured and
 * the only thing left to do is press "Solve it". The colours below are checked
 * against validation.js as they are written, so a sample cannot drift away from
 * the message it claims to trigger.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../solver.js');
const V = require('../validation.js');

const CENTRES = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };
const LETTER = { white: 'w', yellow: 'y', green: 'g', blue: 'b', red: 'r', orange: 'o' };
const KNOWN = ['missing', 'centres', 'count', 'twist', 'flip', 'parity', 'corner-order', 'stuck'];

// One fixed scramble for every sample, so each cube looks like a real one
// part-way through a solve rather than a solved cube with a smudge on it.
const SCRAMBLE = "R U R' U' F' U F R2 D' L F2 B' U2 R D";
const base = Array.from(L.applyMoves(L.solvedState(), L.parse(SCRAMBLE)),
  face => CENTRES[L.FACE_ORDER[face]]);

const cube = names => names.map(name => (name ? LETTER[name] : '.')).join('');
function paint(pairs) {
  const out = base.slice();
  for (const pair of pairs) out[pair[0]] = pair[1];
  return out;
}
function swap(a, b) { return paint([[a, base[b]], [b, base[a]]]); }
function turn(piece, shift) {
  return paint(piece.map((index, n) => [index, base[piece[(n + shift) % piece.length]]]));
}
function trade(p, q) {
  return paint(p.map((i, n) => [i, base[q[n]]]).concat(q.map((i, n) => [i, base[p[n]]])));
}
const blank = indices => paint(indices.map(index => [index, null]));

/* Each sample names the message it should produce: the code the page looks up
 * for its heading, which is "pieces" for any colour mix that cannot exist. */
const SAMPLES = [
  { file: 'missing-a-few-stickers', code: 'missing',
    title: 'A few stickers left unpainted',
    note: 'Four stickers have no colour. The page should point at them and ask for the rest.',
    names: blank([1, 2, 20, 47]) },
  { file: 'missing-whole-face', code: 'missing',
    title: 'A whole face left unpainted',
    note: 'The back face is empty, as if the child stopped before turning the cube round.',
    names: blank([45, 46, 47, 48, 49, 50, 51, 52, 53]) },

  { file: 'two-centres-same-colour', code: 'centres',
    title: 'Two centres painted the same colour',
    note: 'The back centre repeats the top centre, so one colour is missing from the middles.',
    names: paint([[49, base[4]]]) },
  { file: 'three-centres-same-colour', code: 'centres',
    title: 'Three centres painted the same colour',
    note: 'Two middles were overpainted, so two colours are missing and no single repaint fixes it.',
    names: paint([[49, base[4]], [40, base[4]]]) },

  { file: 'one-sticker-wrong-colour', code: 'count',
    title: 'One sticker the wrong colour',
    note: 'Ten of one colour, eight of another: the classic mis-read. One repaint should fix it.',
    names: paint([[0, 'red']]) },
  { file: 'two-stickers-wrong-colour', code: 'count',
    title: 'Two stickers the wrong colour',
    note: 'Two stickers read as the same wrong colour, so the page has pairs of repaints to offer.',
    names: paint([[0, 'red'], [19, 'red']]) },
  { file: 'four-stickers-wrong-colour', code: 'count',
    title: 'Four stickers the wrong colour',
    note: 'Too far off to guess a repair: the page should show the counts and leave the fixing to the child.',
    names: paint([[0, 'red'], [1, 'red'], [19, 'red'], [20, 'red']]) },

  { file: 'twisted-corner', code: 'twist',
    title: 'A corner twisted in place',
    note: 'The three colours of one corner were entered rotated by one.',
    names: turn(L.CORNERS[0], 1) },
  { file: 'twisted-corner-other-way', code: 'twist',
    title: 'A corner twisted the other way',
    note: 'Another corner, rotated the opposite way, on a different part of the cube.',
    names: turn(L.CORNERS[5], 2) },

  { file: 'flipped-edge', code: 'flip',
    title: 'An edge flipped in place',
    note: 'The two colours of one edge were entered the wrong way round.',
    names: turn(L.EDGES[0], 1) },
  { file: 'flipped-edge-elsewhere', code: 'flip',
    title: 'An edge flipped, further round the cube',
    note: 'The same mistake on an edge that is harder to spot.',
    names: turn(L.EDGES[7], 1) },

  { file: 'two-edges-swapped', code: 'parity',
    title: 'Two edges swapped',
    note: 'Two whole edge pieces have traded places, which a real cube cannot do.',
    names: trade(L.EDGES[1], L.EDGES[4]) },
  { file: 'two-corners-swapped', code: 'parity',
    title: 'Two corners swapped',
    note: 'The same impossible trade, with corners instead of edges.',
    names: trade(L.CORNERS[1], L.CORNERS[3]) },

  { file: 'impossible-corner', code: 'pieces',
    title: 'A corner with colours that cannot meet',
    note: 'Two stickers traded places across pieces, leaving a corner no real cube has.',
    names: swap(0, 1) },
  { file: 'impossible-edge', code: 'pieces',
    title: 'An edge with colours that cannot meet',
    note: 'The same kind of trade, this time producing an impossible edge.',
    names: swap(1, 5) },
  { file: 'duplicate-corner', code: 'pieces',
    title: 'Two corners that look like the same piece',
    note: 'Both corners now carry the same three colours.',
    names: swap(1, 18) },
  { file: 'duplicate-edge', code: 'pieces',
    title: 'Two edges that look like the same piece',
    note: 'Both edges now carry the same two colours.',
    names: swap(1, 19) },

  { file: 'mirrored-corner', code: 'corner-order',
    title: 'A corner with its colours in mirrored order',
    note: 'The right three colours on a corner, but read round the wrong way.',
    names: swap(0, 5) },

  { file: 'valid-scramble', code: null,
    title: 'A valid cube (control)',
    note: 'The plain scramble every other sample is built from. It should solve, not complain.',
    names: base.slice() }
];

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function page(sample) {
  const target = '../index.html#v=1&cube=' + cube(sample.names) + '&view=capture';
  return '<!doctype html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<meta name="robots" content="noindex">\n' +
'<title>Sample: ' + esc(sample.title) + '</title>\n' +
'<script>location.replace(' + JSON.stringify(target) + ');</script>\n' +
'<style>\n' +
'  body { font: 16px/1.6 system-ui, sans-serif; margin: 2rem auto; max-width: 34rem; padding: 0 1rem; }\n' +
'  code { word-break: break-all; }\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<h1>' + esc(sample.title) + '</h1>\n' +
'<p>' + esc(sample.note) + '</p>\n' +
'<p>Expected message: <code>' + esc(sample.code || 'none - the cube is valid') + '</code></p>\n' +
'<p><a href="' + esc(target) + '">Open the coach with these colours</a></p>\n' +
'<p><a href="./index.html">All samples</a></p>\n' +
'</body>\n' +
'</html>\n';
}

function indexPage(rows) {
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.code === row.code) last.rows.push(row);
    else groups.push({ code: row.code, rows: [row] });
  }
  const list = groups.map(group =>
    '<h2>' + esc(group.code || 'valid cube') + '</h2>\n<ul>\n' +
    group.rows.map(row => '  <li><a href="./' + row.file + '.html">' + esc(row.title) + '</a>' +
      '<br><span class="note">' + esc(row.note) + '</span></li>').join('\n') +
    '\n</ul>').join('\n');
  return '<!doctype html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<meta name="robots" content="noindex">\n' +
'<title>Cube Coach - sample cubes</title>\n' +
'<style>\n' +
'  body { font: 16px/1.6 system-ui, sans-serif; margin: 2rem auto; max-width: 44rem; padding: 0 1rem; }\n' +
'  h2 { margin: 2rem 0 .5rem; font-size: .85rem; text-transform: uppercase; letter-spacing: .08em; color: #666; }\n' +
'  li { margin-bottom: .6rem; }\n' +
'  .note { color: #666; font-size: .9rem; }\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<h1>Sample cubes</h1>\n' +
'<p>Each link opens the coach (<a href="../index.html">../index.html</a>) with the colours\n' +
'already painted, so a scenario can be tried without colouring six faces again. Press\n' +
'<strong>Solve it</strong> on the page that loads to see what the coach says about them.</p>\n' +
'<p>Rebuild these files with <code>node cube/samples/generate.js</code>.</p>\n' +
list + '\n' +
'</body>\n' +
'</html>\n';
}

const rows = [];
for (const sample of SAMPLES) {
  const report = V.inspect(sample.names);
  const shown = report.ok ? null : (KNOWN.indexOf(report.code) >= 0 ? report.code : 'pieces');
  if (shown !== sample.code) {
    throw new Error(sample.file + ': expected ' + sample.code + ', validation says ' +
      shown + ' (' + report.code + ')');
  }
  fs.writeFileSync(path.join(__dirname, sample.file + '.html'), page(sample));
  rows.push(sample);
  console.log(sample.file.padEnd(28) + String(shown).padEnd(14) +
    'suggested fixes: ' + (report.suggestions ? report.suggestions.length : 0));
}
fs.writeFileSync(path.join(__dirname, 'index.html'), indexPage(rows));
console.log('\n' + rows.length + ' samples written to ' + __dirname);
