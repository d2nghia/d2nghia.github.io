/** Run with: node --test cube/start.test.js */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('./progress.js');

/** The chooser page: index.html plus the little script that drives it. */
function chooser({ hash = '', search = '', storage = new Map() } = {}) {
  const nodes = new Map(), replaced = [];
  function element() {
    const classes = new Set();
    return {
      style: { setProperty(name, value) { this[name] = String(value); } },
      dataset: {}, children: [], attributes: {}, hidden: false, textContent: '',
      clientWidth: 300, clientHeight: 300,
      classList: {
        add(...names) { names.forEach(n => classes.add(n)); },
        remove(...names) { names.forEach(n => classes.delete(n)); },
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      appendChild(child) { this.children.push(child); child.parent = this; },
      insertAdjacentHTML(position, markup) { this.markup = (this.markup || '') + markup; },
      querySelectorAll() { return []; },
      closest() { return null; }
    };
  }
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  for (const [tag, id] of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const el = element(); el.id = id;
    el.hidden = /\shidden(?:\s|>)/.test(tag);
    nodes.set(id, el);
  }
  const get = id => { assert.ok(nodes.has(id), 'Missing HTML element: ' + id); return nodes.get(id); };
  const document = {
    body: element(), documentElement: {}, createElement: element, getElementById: get,
    querySelectorAll: () => [], addEventListener() {}
  };
  const window = {
    location: {
      origin: 'https://example.test', pathname: '/cube/index.html', search, hash,
      replace(url) { replaced.push(url); }
    },
    scrollTo() {}, addEventListener() {}, matchMedia: () => ({ matches: false })
  };
  const context = vm.createContext({
    window, self: window, document, URLSearchParams, Int8Array, btoa, atob,
    setTimeout() {}, clearTimeout() {},
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
  });
  const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
  run('lang.js');
  run('solver.js');
  run('cubeview.js');
  run('start.js');
  return { get, window, document, storage, replaced, html };
}

test('the chooser draws both ways in and sends neither of them through saved progress', () => {
  const storage = new Map([[P.STORE, P.encode({ view: 'capture', names: Array(54).fill(null) })]]);
  const page = chooser({ storage });
  const before = new Map(storage);
  assert.equal(page.replaced.length, 0);
  assert.ok(page.get('guided-preview').children.length > 0, 'the guided card shows a cube');
  assert.equal(page.get('instructions-preview').children.length, 7, 'the step card shows seven steps');
  assert.deepEqual(storage, before, 'the chooser never touches a saved lesson');
});

test('the chooser links to the two pages, asking the lesson page for a clean start', () => {
  const html = chooser().html;
  assert.match(html, /id="go-camera"[^>]*href="solve\.html\?fresh=1"/);
  assert.match(html, /id="go-steps"[^>]*href="steps\.html"/);
});

test('progress links shared before the split are handed to the lesson page, hash and all', () => {
  const hash = P.encode({ view: 'capture', names: Array(54).fill('white') });
  for (const link of [hash, '#p=3.invalid', '#v=1&cube=broken&view=coach']) {
    const page = chooser({ hash: link, search: '?example=kept' });
    assert.deepEqual(page.replaced, ['solve.html?example=kept' + link]);
    assert.equal(page.get('instructions-preview').children.length, 0, 'and nothing else is drawn first');
  }
});

test('an ordinary visit, or one with an unrelated fragment, stays on the chooser', () => {
  for (const hash of ['', '#top', '#lang=vi']) {
    const page = chooser({ hash });
    assert.deepEqual(page.replaced, []);
    assert.equal(page.get('instructions-preview').children.length, 7);
  }
});
