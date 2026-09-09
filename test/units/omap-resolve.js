'use strict';


var assert = require('assert');
var yaml   = require('../../');

// The published tarball ships dist/ (see package.json "files"), and
// `import 'js-yaml'` / unpkg resolve to bundles built from index.js + lib/,
// so the !!omap resolver has to be non-quadratic through them as well.
var umd = require('../../dist/js-yaml.js');


function assertYamlException(mod, fn, pattern) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof mod.YAMLException, 'expected YAMLException, got: ' + err);
    assert.ok(pattern.test(err.message), 'expected ' + pattern + ' to match: ' + err.message);
    return;
  }

  assert.fail('expected YAMLException');
}


// An !!omap is a sequence of single-pair mappings whose keys must be unique.
// Duplicate detection used to scan an array of every key seen so far, so a
// document that grows linearly cost a quadratic number of key comparisons.
function createOmapDocument(count) {
  var lines = [ '--- !!omap' ];
  var i;

  for (i = 0; i < count; i++) {
    lines.push('- key' + i + ': ' + i);
  }

  return lines.join('\n') + '\n';
}


// Two sizes, the larger one 4x the smaller. Linear resolution costs ~4x as
// much on the larger document; the quadratic scan cost ~16x as much, and that
// ratio is what actually distinguishes the two implementations - an absolute
// budget alone is too blunt, since the quadratic scan of 50000 keys still
// finishes in about a second.
var SMALL_OMAP_ENTRIES = 50000;
var LARGE_OMAP_ENTRIES = SMALL_OMAP_ENTRIES * 4;
var SMALL_OMAP         = createOmapDocument(SMALL_OMAP_ENTRIES);
var LARGE_OMAP         = createOmapDocument(LARGE_OMAP_ENTRIES);

// Growth allowed between the two sizes. Measured on the CI matrix: linear
// resolution grows ~4x, the quadratic scan grew 13.4-14.6x. 10 sits between
// them - 2.5x headroom over linear growth, so a GC pause on the larger
// document cannot trip it, while still leaving a >1.3x gap below the slowest
// quadratic run. Also cap the absolute time - the quadratic resolver needs
// tens of seconds on the larger document, linear needs well under a second.
var MAX_GROWTH_FACTOR = 10;
var MAX_ELAPSED       = 5000;


function timeLoad(mod, source, entries) {
  var start = Date.now();
  var doc = mod.load(source);

  assert.strictEqual(doc.length, entries);
  return Date.now() - start;
}


function assertResolvesLinearly(mod) {
  var small   = timeLoad(mod, SMALL_OMAP, SMALL_OMAP_ENTRIES);
  var large   = timeLoad(mod, LARGE_OMAP, LARGE_OMAP_ENTRIES);
  var grew    = large / Math.max(small, 1);
  var timings = small + 'ms -> ' + large + 'ms';

  assert.ok(grew < MAX_GROWTH_FACTOR, '4x the entries cost ' + grew.toFixed(1) + 'x the time: ' + timings);
  assert.ok(large < MAX_ELAPSED, 'resolving ' + LARGE_OMAP_ENTRIES + ' !!omap entries took ' + large + 'ms');
}


describe('!!omap resolving', function () {
  this.timeout(60000);

  it('resolves a large !!omap without quadratic key lookups', function () {
    assertResolvesLinearly(yaml);
  });

  it('resolves a large !!omap without quadratic key lookups through dist/js-yaml.js', function () {
    assertResolvesLinearly(umd);
  });

  it('still rejects a duplicate key in !!omap', function () {
    assertYamlException(yaml, function () {
      yaml.load('--- !!omap\n- foo: 1\n- bar: 2\n- foo: 3\n');
    }, /cannot resolve a node with !<tag:yaml\.org,2002:omap> explicit tag/);
  });

  // Keys are tracked on a plain object now, so a key that shadows an
  // Object.prototype member must neither be swallowed nor falsely reported.
  it('still rejects a duplicate __proto__ key in !!omap', function () {
    assertYamlException(yaml, function () {
      yaml.load('--- !!omap\n- __proto__: 1\n- __proto__: 2\n');
    }, /cannot resolve a node with !<tag:yaml\.org,2002:omap> explicit tag/);
  });

  it('still rejects a duplicate toString key in !!omap', function () {
    assertYamlException(yaml, function () {
      yaml.load('--- !!omap\n- toString: 1\n- toString: 2\n');
    }, /cannot resolve a node with !<tag:yaml\.org,2002:omap> explicit tag/);
  });

  it('accepts distinct keys named after Object.prototype members', function () {
    var doc = yaml.load('--- !!omap\n- __proto__: 1\n- toString: 2\n- hasOwnProperty: 3\n- constructor: 4\n');

    assert.strictEqual(doc.length, 4);
    assert.strictEqual(Object.keys(doc[0])[0], '__proto__');
    assert.strictEqual(doc[1].toString, 2);
    assert.strictEqual(doc[2].hasOwnProperty, 3);
    assert.strictEqual(doc[3].constructor, 4);
  });
});
