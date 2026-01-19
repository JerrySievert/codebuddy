'use strict';

/**
 * @fileoverview Tests for naming convention analysis functions.
 */

import { test } from 'st';
import {
  detect_convention,
  check_convention,
  analyze_identifier,
  NAMING_PATTERNS,
  LANGUAGE_CONVENTIONS
} from '../../../lib/analysis/naming.mjs';

// ============ Constants tests ============

await test('NAMING_PATTERNS has expected patterns', async (t) => {
  t.assert.ok(NAMING_PATTERNS.camelCase, 'Should have camelCase pattern');
  t.assert.ok(NAMING_PATTERNS.PascalCase, 'Should have PascalCase pattern');
  t.assert.ok(NAMING_PATTERNS.snake_case, 'Should have snake_case pattern');
  t.assert.ok(NAMING_PATTERNS.SCREAMING_SNAKE_CASE, 'Should have SCREAMING_SNAKE_CASE pattern');
});

await test('LANGUAGE_CONVENTIONS has patterns for major languages', async (t) => {
  t.assert.ok(LANGUAGE_CONVENTIONS.javascript, 'Should have JavaScript conventions');
  t.assert.ok(LANGUAGE_CONVENTIONS.typescript, 'Should have TypeScript conventions');
  t.assert.ok(LANGUAGE_CONVENTIONS.python, 'Should have Python conventions');
  t.assert.ok(LANGUAGE_CONVENTIONS.java, 'Should have Java conventions');
  t.assert.ok(LANGUAGE_CONVENTIONS.go, 'Should have Go conventions');
  t.assert.ok(LANGUAGE_CONVENTIONS.rust, 'Should have Rust conventions');
});

// ============ detect_convention tests ============

await test('detect_convention identifies camelCase', async (t) => {
  const result = detect_convention('myVariableName');
  t.assert.ok(result.includes('camelCase'), 'Should detect camelCase');
});

await test('detect_convention identifies PascalCase', async (t) => {
  const result = detect_convention('MyClassName');
  t.assert.ok(result.includes('PascalCase'), 'Should detect PascalCase');
});

await test('detect_convention identifies snake_case', async (t) => {
  const result = detect_convention('my_variable_name');
  t.assert.ok(result.includes('snake_case'), 'Should detect snake_case');
});

await test('detect_convention identifies SCREAMING_SNAKE_CASE', async (t) => {
  const result = detect_convention('MY_CONSTANT_VALUE');
  t.assert.ok(result.includes('SCREAMING_SNAKE_CASE'), 'Should detect SCREAMING_SNAKE_CASE');
});

await test('detect_convention returns unknown for non-matching patterns', async (t) => {
  const result = detect_convention('123invalid');
  t.assert.ok(result.includes('unknown'), 'Should return unknown for invalid names');
});

await test('detect_convention handles single letter names', async (t) => {
  const lower = detect_convention('x');
  const upper = detect_convention('X');
  t.assert.ok(lower.length > 0, 'Should handle lowercase single letter');
  t.assert.ok(upper.length > 0, 'Should handle uppercase single letter');
});

// ============ check_convention tests ============

await test('check_convention validates JavaScript function naming', async (t) => {
  const result = check_convention('myFunction', 'function', 'javascript');
  t.assert.ok(result.compliant, 'camelCase function should be compliant in JavaScript');
});

await test('check_convention validates JavaScript class naming', async (t) => {
  const result = check_convention('MyClass', 'class', 'javascript');
  t.assert.ok(result.compliant, 'PascalCase class should be compliant in JavaScript');
});

await test('check_convention detects non-compliant JavaScript naming', async (t) => {
  const result = check_convention('my_function', 'function', 'javascript');
  t.assert.ok(!result.compliant, 'snake_case function should not be compliant in JavaScript');
  t.assert.ok(result.reason, 'Should provide reason for non-compliance');
});

await test('check_convention validates Python function naming', async (t) => {
  const result = check_convention('my_function', 'function', 'python');
  t.assert.ok(result.compliant, 'snake_case function should be compliant in Python');
});

await test('check_convention validates Python class naming', async (t) => {
  const result = check_convention('MyClass', 'class', 'python');
  t.assert.ok(result.compliant, 'PascalCase class should be compliant in Python');
});

await test('check_convention validates Java constant naming', async (t) => {
  const result = check_convention('MAX_VALUE', 'constant', 'java');
  t.assert.ok(result.compliant, 'SCREAMING_SNAKE_CASE constant should be compliant in Java');
});

await test('check_convention handles unknown language', async (t) => {
  const result = check_convention('anything', 'function', 'unknown_language');
  t.assert.ok(result.compliant, 'Unknown language should be treated as compliant');
  t.assert.eq(result.reason, 'Unknown language', 'Should indicate unknown language');
});

await test('check_convention returns expected and detected conventions', async (t) => {
  const result = check_convention('myVar', 'variable', 'javascript');
  t.assert.ok(Array.isArray(result.expected), 'Should return expected conventions');
  t.assert.ok(Array.isArray(result.detected), 'Should return detected conventions');
});

// ============ analyze_identifier tests ============

await test('analyze_identifier detects too short names', async (t) => {
  const result = analyze_identifier('a', 'javascript');
  const has_too_short = result.some(issue => issue.type === 'too_short');
  t.assert.ok(has_too_short, 'Should detect single character name as too short');
});

await test('analyze_identifier allows common single letter names', async (t) => {
  const result = analyze_identifier('i', 'javascript');
  const has_too_short = result.some(issue => issue.type === 'too_short');
  t.assert.ok(!has_too_short, 'Should allow common single letter names like i');
});

await test('analyze_identifier allows j, k, n loop variables', async (t) => {
  for (const name of ['j', 'k', 'n']) {
    const result = analyze_identifier(name, 'javascript');
    const has_too_short = result.some(issue => issue.type === 'too_short');
    t.assert.ok(!has_too_short, `Should allow ${name} as loop variable`);
  }
});

await test('analyze_identifier detects too long names', async (t) => {
  const long_name = 'thisIsAnExtremelyLongVariableNameThatExceedsFortyCharacters';
  const result = analyze_identifier(long_name, 'javascript');
  const has_too_long = result.some(issue => issue.type === 'too_long');
  t.assert.ok(has_too_long, 'Should detect name exceeding 40 characters');
});

await test('analyze_identifier detects reserved words', async (t) => {
  const result = analyze_identifier('class', 'javascript');
  const has_reserved = result.some(issue => issue.type === 'reserved_word');
  t.assert.ok(has_reserved, 'Should detect JavaScript reserved word');
});

await test('analyze_identifier detects Python reserved words', async (t) => {
  const result = analyze_identifier('def', 'python');
  const has_reserved = result.some(issue => issue.type === 'reserved_word');
  t.assert.ok(has_reserved, 'Should detect Python reserved word');
});

await test('analyze_identifier detects mixed conventions', async (t) => {
  const result = analyze_identifier('camelCase_with_snake', 'javascript');
  const has_mixed = result.some(issue => issue.type === 'mixed_conventions');
  t.assert.ok(has_mixed, 'Should detect mixed camelCase and snake_case');
});

await test('analyze_identifier detects consecutive underscores', async (t) => {
  const result = analyze_identifier('my__var', 'javascript');
  const has_consecutive = result.some(issue => issue.type === 'consecutive_underscores');
  t.assert.ok(has_consecutive, 'Should detect consecutive underscores');
});

await test('analyze_identifier returns empty array for good names', async (t) => {
  const result = analyze_identifier('userName', 'javascript');
  t.assert.eq(result.length, 0, 'Good names should have no issues');
});

await test('analyze_identifier handles snake_case names correctly', async (t) => {
  const result = analyze_identifier('user_name', 'python');
  const has_mixed = result.some(issue => issue.type === 'mixed_conventions');
  t.assert.ok(!has_mixed, 'Pure snake_case should not be flagged as mixed');
});
