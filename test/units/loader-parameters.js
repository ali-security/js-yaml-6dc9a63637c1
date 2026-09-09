'use strict';

var assert = require('assert');
var yaml = require('../..');

// `a0: &a0 { k0: 0 }`, then each `aN` merges `a(N-1)` and adds one key, so the
// last anchor owns N keys while the document itself only grows linearly.
function createMergeChain(count) {
  var lines = [ 'a0: &a0 { k0: 0 }' ];
  var i;

  for (i = 1; i < count; i++) {
    lines.push('a' + i + ': &a' + i + ' { <<: *a' + (i - 1) + ', k' + i + ': ' + i + ' }');
  }

  lines.push('b: *a' + (count - 1));
  return lines.join('\n') + '\n';
}

// A single merge sequence pulling in `count` distinct one-key anchors.
function createMergeSeq(count) {
  var anchors = [];
  var aliases = [];
  var i;

  for (i = 0; i < count; i++) {
    anchors.push('- &x' + i + ' {a' + i + ': ' + i + '}');
    aliases.push('*x' + i);
  }

  return anchors.join('\n') + '\n- <<: [' + aliases.join(', ') + ']\n';
}

describe('loader parameters', function () {
  var testStr = 'test: 1 \ntest: 2';
  var expected =  [ { test: 2 } ];
  var result;

  it('loadAll(input, options)', function () {
    result = yaml.loadAll(testStr, { json: true });
    assert.deepStrictEqual(result, expected);

    result = [];
    yaml.loadAll(testStr, function (doc) {
      result.push(doc);
    }, { json: true });
    assert.deepStrictEqual(result, expected);
  });

  it('loadAll(input, null, options)', function () {
    result = yaml.loadAll(testStr, null, { json: true });
    assert.deepStrictEqual(result, expected);

    result = [];
    yaml.loadAll(testStr, function (doc) {
      result.push(doc);
    }, { json: true });
    assert.deepStrictEqual(result, expected);
  });

  it('loadAll(input, options)', function () {
    result = yaml.loadAll(testStr, { json: true });
    assert.deepStrictEqual(result, expected);

    result = [];
    yaml.loadAll(testStr, function (doc) {
      result.push(doc);
    }, { json: true });
    assert.deepStrictEqual(result, expected);
  });

  it('loadAll(input, null, options)', function () {
    result = yaml.loadAll(testStr, null, { json: true });
    assert.deepStrictEqual(result, expected);

    result = [];
    yaml.loadAll(testStr, function (doc) {
      result.push(doc);
    }, { json: true });
    assert.deepStrictEqual(result, expected);
  });

  it('maxTotalMergeKeys - caps total merge keys', function () {
    assert.doesNotThrow(function () {
      yaml.load(createMergeSeq(3), { maxTotalMergeKeys: 5 });
    });
    assert.throws(function () {
      yaml.load(createMergeSeq(3), { maxTotalMergeKeys: 2 });
    }, /maxTotalMergeKeys/);
    assert.doesNotThrow(function () {
      yaml.load(createMergeSeq(3), { maxTotalMergeKeys: -1 });
    });

    var chain = yaml.load(createMergeChain(150), { maxTotalMergeKeys: -1 });
    assert.strictEqual(Object.keys(chain.b).length, 150);
  });

  it('loadAll - maxTotalMergeKeys is shared across all documents', function () {
    var src = `
---
a: &a { k1: 1, k2: 2 }
b: { <<: *a }
---
a: &a { k1: 1, k2: 2 }
b: { <<: *a }
`;

    assert.doesNotThrow(function () {
      yaml.loadAll(src, { maxTotalMergeKeys: 4 });
    });
    assert.throws(function () {
      yaml.loadAll(src, { maxTotalMergeKeys: 3 });
    }, /maxTotalMergeKeys/);
  });
});
