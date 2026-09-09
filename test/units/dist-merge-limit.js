'use strict';


var assert = require('assert');
var fs     = require('fs');
var path   = require('path');

// The published tarball ships dist/ (see package.json "files"), and
// dist/js-yaml.mjs is what `import 'js-yaml'` resolves to while
// dist/js-yaml.min.js is what unpkg/jsDelivr serve. The bundles are rebuilt
// from index.js + lib/, so the merge-key cap has to be reachable through them
// too - not only through the CommonJS entry point.
var umd = require('../../dist/js-yaml.js');
var min = require('../../dist/js-yaml.min.js');


function createMergeChain(count) {
  var lines = [ 'a0: &a0 { k0: 0 }' ];
  var i;

  for (i = 1; i < count; i++) {
    lines.push('a' + i + ': &a' + i + ' { <<: *a' + (i - 1) + ', k' + i + ': ' + i + ' }');
  }

  lines.push('b: *a' + (count - 1));
  return lines.join('\n') + '\n';
}


describe('dist bundles - maxTotalMergeKeys', function () {
  this.timeout(10000);

  it('dist/js-yaml.js caps total merge keys', function () {
    assert.throws(function () {
      umd.load(createMergeChain(4000));
    }, /merge keys exceeded maxTotalMergeKeys/);

    var chain = umd.load(createMergeChain(20), { maxTotalMergeKeys: -1 });
    assert.strictEqual(Object.keys(chain.b).length, 20);
  });

  it('dist/js-yaml.min.js caps total merge keys', function () {
    assert.throws(function () {
      min.load(createMergeChain(4000));
    }, /merge keys exceeded maxTotalMergeKeys/);

    var chain = min.load(createMergeChain(20), { maxTotalMergeKeys: -1 });
    assert.strictEqual(Object.keys(chain.b).length, 20);
  });

  it('dist/js-yaml.mjs carries the merge-key cap', function () {
    var src = fs.readFileSync(path.resolve(__dirname, '../../dist/js-yaml.mjs'), 'utf8');

    assert.notStrictEqual(src.indexOf('this.maxTotalMergeKeys = '), -1);
    assert.notStrictEqual(src.indexOf('merge keys exceeded maxTotalMergeKeys'), -1);
  });
});
