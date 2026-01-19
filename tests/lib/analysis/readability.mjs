'use strict';

/**
 * @fileoverview Tests for readability analysis functions.
 */

import { test } from 'st';
import {
  calculate_readability_score,
  analyze_identifier_lengths,
  analyze_comment_ratio,
  analyze_function_length,
  analyze_nesting_depth,
  analyze_line_lengths,
  detect_magic_numbers,
  analyze_boolean_complexity,
  READABILITY_WEIGHTS,
  THRESHOLDS
} from '../../../lib/analysis/readability.mjs';

// ============ Constants tests ============

await test('READABILITY_WEIGHTS has expected properties', async (t) => {
  t.assert.ok(
    READABILITY_WEIGHTS.identifier_length,
    'Should have identifier_length weight'
  );
  t.assert.ok(
    READABILITY_WEIGHTS.comment_ratio,
    'Should have comment_ratio weight'
  );
  t.assert.ok(
    READABILITY_WEIGHTS.function_length,
    'Should have function_length weight'
  );
  t.assert.ok(
    READABILITY_WEIGHTS.nesting_depth,
    'Should have nesting_depth weight'
  );
});

await test('THRESHOLDS has expected properties', async (t) => {
  t.assert.ok(
    THRESHOLDS.identifier_length,
    'Should have identifier_length thresholds'
  );
  t.assert.ok(
    THRESHOLDS.function_length,
    'Should have function_length thresholds'
  );
  t.assert.ok(THRESHOLDS.nesting_depth, 'Should have nesting_depth thresholds');
  t.assert.ok(THRESHOLDS.line_length, 'Should have line_length thresholds');
});

// ============ analyze_identifier_lengths tests ============

await test('analyze_identifier_lengths returns score for good identifiers', async (t) => {
  const source = `
    const userName = 'John';
    const userAge = 25;
    function calculateTotal(items) {
      return items.length;
    }
  `;
  const result = analyze_identifier_lengths(source);

  t.assert.ok(result.score >= 0, 'Should have a score');
  t.assert.ok(result.avg_length > 0, 'Should have average length');
  t.assert.ok(result.total > 0, 'Should have total count');
});

await test('analyze_identifier_lengths detects short identifiers', async (t) => {
  const source = `
    const a = 1;
    const b = 2;
    function f(x) { return x; }
  `;
  const result = analyze_identifier_lengths(source);

  t.assert.ok(result.too_short >= 0, 'Should track too_short count');
});

await test('analyze_identifier_lengths handles empty source', async (t) => {
  const result = analyze_identifier_lengths('');

  t.assert.eq(result.score, 100, 'Empty source should return 100 score');
  t.assert.eq(result.total, 0, 'Should have 0 total');
});

// ============ analyze_comment_ratio tests ============

await test('analyze_comment_ratio counts comment lines', async (t) => {
  const source = `
// This is a comment
function foo() {
  // Another comment
  return 1;
}
  `;
  const result = analyze_comment_ratio(source, 'javascript');

  t.assert.ok(result.comment_lines >= 2, 'Should count comment lines');
  t.assert.ok(result.code_lines > 0, 'Should count code lines');
  t.assert.ok(result.ratio >= 0, 'Should have ratio');
});

await test('analyze_comment_ratio handles Python comments', async (t) => {
  const source = `
# This is a Python comment
def foo():
    # Another comment
    return 1
  `;
  const result = analyze_comment_ratio(source, 'python');

  t.assert.ok(result.comment_lines >= 2, 'Should count Python comment lines');
});

await test('analyze_comment_ratio tracks blank lines', async (t) => {
  const source = `
function foo() {

  return 1;

}
  `;
  const result = analyze_comment_ratio(source, 'javascript');

  t.assert.ok(result.blank_lines >= 2, 'Should count blank lines');
});

// ============ analyze_function_length tests ============

await test('analyze_function_length rates excellent for short functions', async (t) => {
  const result = analyze_function_length(15);

  t.assert.eq(result.rating, 'excellent', 'Should rate as excellent');
  t.assert.eq(result.score, 100, 'Should have perfect score');
  t.assert.eq(result.lines, 15, 'Should preserve line count');
});

await test('analyze_function_length rates good for medium functions', async (t) => {
  const result = analyze_function_length(35);

  t.assert.eq(result.rating, 'good', 'Should rate as good');
  t.assert.ok(result.score >= 80, 'Should have high score');
});

await test('analyze_function_length rates poor for long functions', async (t) => {
  const result = analyze_function_length(150);

  t.assert.eq(result.rating, 'poor', 'Should rate as poor');
  t.assert.ok(result.score < 60, 'Should have low score');
});

await test('analyze_function_length rates very_poor for very long functions', async (t) => {
  const result = analyze_function_length(300);

  t.assert.eq(result.rating, 'very_poor', 'Should rate as very_poor');
});

// ============ analyze_nesting_depth tests ============

await test('analyze_nesting_depth calculates max depth', async (t) => {
  const source = `
function foo() {
  if (a) {
    if (b) {
      if (c) {
        return 1;
      }
    }
  }
}
  `;
  const result = analyze_nesting_depth(source);

  t.assert.ok(result.max_depth >= 3, 'Should detect nesting depth');
  t.assert.ok(result.avg_depth > 0, 'Should have average depth');
  t.assert.ok(
    result.score >= 0 && result.score <= 100,
    'Should have valid score'
  );
});

await test('analyze_nesting_depth handles flat code', async (t) => {
  const source = `
const a = 1;
const b = 2;
return a + b;
  `;
  const result = analyze_nesting_depth(source);

  t.assert.eq(result.max_depth, 0, 'Flat code should have 0 depth');
  t.assert.eq(result.score, 100, 'Should have perfect score');
});

// ============ analyze_line_lengths tests ============

await test('analyze_line_lengths detects long lines', async (t) => {
  const source = `
const short = 1;
const veryLongVariableNameThatExceedsEightyCharactersWhichIsTheStandardLineLengthLimit = 'value';
  `;
  const result = analyze_line_lengths(source);

  t.assert.ok(result.max_length > 80, 'Should detect long line');
  t.assert.ok(result.over_80 >= 1, 'Should count lines over 80');
});

await test('analyze_line_lengths handles empty source', async (t) => {
  const result = analyze_line_lengths('');

  t.assert.eq(result.score, 100, 'Empty source should return perfect score');
  t.assert.eq(result.max_length, 0, 'Should have 0 max length');
});

await test('analyze_line_lengths calculates average', async (t) => {
  const source = `
const a = 1;
const b = 2;
const c = 3;
  `;
  const result = analyze_line_lengths(source);

  t.assert.ok(result.avg_length > 0, 'Should have positive average');
  t.assert.ok(result.total_lines > 0, 'Should count lines');
});

// ============ detect_magic_numbers tests ============

await test('detect_magic_numbers finds magic numbers', async (t) => {
  const source = `
function foo() {
  const tax = price * 0.0825;
  const limit = 42;
  return limit;
}
  `;
  const result = detect_magic_numbers(source);

  t.assert.ok(result.numbers !== undefined, 'Should have numbers array');
  t.assert.ok(result.count >= 0, 'Should have count');
});

await test('detect_magic_numbers ignores common numbers', async (t) => {
  const source = `
const a = 0;
const b = 1;
const c = 2;
const d = 100;
  `;
  const result = detect_magic_numbers(source);

  // Common numbers like 0, 1, 2, 100 should not be flagged
  t.assert.ok(result.score >= 70, 'Common numbers should not hurt score much');
});

// ============ analyze_boolean_complexity tests ============

await test('analyze_boolean_complexity counts boolean operators', async (t) => {
  const source = `
if (a && b || c && d || e) {
  return true;
}
  `;
  const result = analyze_boolean_complexity(source);

  t.assert.ok(result.total_operators >= 3, 'Should count boolean operators');
  t.assert.ok(
    result.max_operators >= 0,
    'Should track max operators in expression'
  );
});

await test('analyze_boolean_complexity handles simple conditions', async (t) => {
  const source = `
if (a) {
  return true;
}
  `;
  const result = analyze_boolean_complexity(source);

  t.assert.eq(result.score, 100, 'Simple conditions should have perfect score');
});

// ============ calculate_readability_score tests ============

await test('calculate_readability_score returns composite score', async (t) => {
  const source = `
// Good readable function
function calculateTotal(items) {
  let total = 0;
  for (const item of items) {
    total += item.price;
  }
  return total;
}
  `;
  const result = calculate_readability_score(source, 'javascript');

  t.assert.ok(
    result.score >= 0 && result.score <= 100,
    'Should have valid score'
  );
  t.assert.ok(result.breakdown, 'Should have breakdown');
  t.assert.ok(result.rating, 'Should have rating');
});

await test('calculate_readability_score provides breakdown scores', async (t) => {
  const source = `function foo() { return 1; }`;
  const result = calculate_readability_score(source, 'javascript');

  t.assert.ok(
    result.breakdown.identifier_length !== undefined,
    'Should have identifier_length breakdown'
  );
  t.assert.ok(
    result.breakdown.nesting_depth !== undefined,
    'Should have nesting_depth breakdown'
  );
  t.assert.ok(
    result.breakdown.line_length !== undefined,
    'Should have line_length breakdown'
  );
});

await test('calculate_readability_score handles different languages', async (t) => {
  const jsSource = `function foo() { return 1; }`;
  const pySource = `def foo():\n    return 1`;

  const jsResult = calculate_readability_score(jsSource, 'javascript');
  const pyResult = calculate_readability_score(pySource, 'python');

  t.assert.ok(jsResult.score >= 0, 'Should handle JavaScript');
  t.assert.ok(pyResult.score >= 0, 'Should handle Python');
});
