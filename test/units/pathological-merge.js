'use strict';


var assert = require('assert');
var yaml   = require('../../');


function assertYamlException(fn, pattern) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof yaml.YAMLException, 'expected YAMLException, got: ' + err);
    assert.ok(pattern.test(err.message), 'expected ' + pattern + ' to match: ' + err.message);
    return;
  }

  assert.fail('expected YAMLException');
}


// Merge-key chain from the advisory: the document grows linearly while the
// number of merged keys grows quadratically (sum of 1..count).
function createMergeChain(count) {
  var lines = [ 'a0: &a0 { k0: 0 }' ];
  var i;

  for (i = 1; i < count; i++) {
    lines.push('a' + i + ': &a' + i + ' { <<: *a' + (i - 1) + ', k' + i + ': ' + i + ' }');
  }

  lines.push('b: *a' + (count - 1));
  return lines.join('\n') + '\n';
}


// GHSA-h67p-54hq-rp68 proof-of-concept: a single anchor holding `keys` keys,
// pulled into one merge sequence `repetitions` times. The input stays
// O(keys + repetitions) while the merge work is O(keys * repetitions) - the
// advisory measured ~3.4s for keys = repetitions = 8000 in 87kb of YAML.
function createRepeatedMergeAliasPattern(repetitions, keys) {
  var pairs   = [];
  var aliases = [];
  var i;

  for (i = 0; i < keys; i++) {
    pairs.push('k' + i + ': 0');
  }

  for (i = 0; i < repetitions; i++) {
    aliases.push('*a');
  }

  return '\na: &a {' + pairs.join(', ') + '}\nb: { <<: [ ' + aliases.join(', ') + ' ] }\n';
}


describe('Pathological tests', function () {
  // Generating the documents below is the only slow part; without the merge-key
  // cap these loads would run for minutes instead of failing fast.
  this.timeout(10000);

  describe('Merge aliases', function () {
    it('throws YAMLException when merge chain exceeds maxTotalMergeKeys', function () {
      assertYamlException(function () {
        yaml.load(createMergeChain(100000));
      }, /merge keys exceeded maxTotalMergeKeys/);
    });

    // Advisory proof-of-concept: ~4000 chained mappings, under 100kb of input,
    // used to burn over a second of CPU. It must now be rejected up front.
    it('rejects the 4000-link merge chain from the advisory', function () {
      assertYamlException(function () {
        yaml.load(createMergeChain(4000));
      }, /merge keys exceeded maxTotalMergeKeys/);
    });

    // A merge sequence repeating the same alias reaches the same cap.
    it('throws YAMLException when a merge sequence exceeds maxTotalMergeKeys', function () {
      var aliases = [];
      var i;

      for (i = 0; i < 20001; i++) {
        aliases.push('*a');
      }

      var src = '\na: &a { k: 0 }\nb: { <<: [ ' + aliases.join(', ') + ' ] }\n';

      assertYamlException(function () {
        yaml.load(src);
      }, /merge keys exceeded maxTotalMergeKeys/);
    });

    // The advisory's own shape: repeated aliases in one merge sequence, all
    // resolving to the same many-key anchor. Unpatched this runs to completion
    // after `keys * repetitions` merge-key visits; the cap now stops it at
    // 10000 because the counter is charged before the "key already set" skip.
    it('rejects the repeated merge-alias pattern from the advisory', function () {
      assertYamlException(function () {
        yaml.load(createRepeatedMergeAliasPattern(3000, 3000));
      }, /merge keys exceeded maxTotalMergeKeys/);
    });

    // A modest repeated-alias merge stays well under the cap and keeps working,
    // so the guard does not change semantics for ordinary documents.
    it('still loads a repeated merge-alias document under the cap', function () {
      var doc = yaml.load(createRepeatedMergeAliasPattern(10, 10));

      assert.strictEqual(Object.keys(doc.b).length, 10);
      assert.strictEqual(doc.b.k9, 0);
    });
  });
});
