'use strict';

/**
 * @fileoverview Tests for complexity calculation functions.
 */

import { test } from 'st';
import {
  calculate_complexity,
  calculate_aggregate_complexity,
  calculate_cyclomatic_complexity,
  calculate_nesting_depth,
  calculate_loc,
  calculate_parameter_count,
  get_complexity_rating
} from '../../../lib/analysis/complexity.mjs';

// ============ calculate_cyclomatic_complexity tests ============

await test('calculate_cyclomatic_complexity returns 1 for empty source', async (t) => {
  t.assert.eq(calculate_cyclomatic_complexity('', 'c'), 1, 'Empty string should return 1');
  t.assert.eq(calculate_cyclomatic_complexity(null, 'c'), 1, 'Null should return 1');
  t.assert.eq(calculate_cyclomatic_complexity(undefined, 'c'), 1, 'Undefined should return 1');
});

await test('calculate_cyclomatic_complexity counts if statements in C', async (t) => {
  const source = `
    int foo(int x) {
      if (x > 0) {
        return 1;
      }
      return 0;
    }
  `;
  const complexity = calculate_cyclomatic_complexity(source, 'c');
  t.assert.ok(complexity > 1, 'Should count if statement');
});

await test('calculate_cyclomatic_complexity counts multiple decision points in C', async (t) => {
  const source = `
    int foo(int x, int y) {
      if (x > 0) {
        if (y > 0) {
          return 1;
        }
      } else if (x < 0) {
        return -1;
      }
      for (int i = 0; i < 10; i++) {
        while (y > 0) {
          y--;
        }
      }
      return 0;
    }
  `;
  const complexity = calculate_cyclomatic_complexity(source, 'c');
  t.assert.ok(complexity >= 5, 'Should count multiple decision points');
});

await test('calculate_cyclomatic_complexity handles JavaScript patterns', async (t) => {
  const source = `
    function foo(x) {
      if (x > 0) {
        for (const item of items) {
          console.log(item);
        }
      }
      const result = x > 0 ? 'positive' : 'negative';
      const value = x ?? 'default';
      return x && y || z;
    }
  `;
  const complexity = calculate_cyclomatic_complexity(source, 'javascript');
  t.assert.ok(complexity >= 5, 'Should count JS-specific patterns like for-of, ??, &&, ||');
});

await test('calculate_cyclomatic_complexity handles Python patterns', async (t) => {
  const source = `
def foo(x):
    if x > 0:
        return 1
    elif x < 0:
        return -1
    for i in range(10):
        while x > 0:
            x -= 1
    return x and y or z
  `;
  const complexity = calculate_cyclomatic_complexity(source, 'python');
  t.assert.ok(complexity >= 5, 'Should count Python-specific patterns');
});

await test('calculate_cyclomatic_complexity counts switch/case statements', async (t) => {
  const source = `
    int foo(int x) {
      switch (x) {
        case 1: return 1;
        case 2: return 2;
        case 3: return 3;
        default: return 0;
      }
    }
  `;
  const complexity = calculate_cyclomatic_complexity(source, 'c');
  t.assert.ok(complexity >= 4, 'Should count switch and case statements');
});

await test('calculate_cyclomatic_complexity counts catch blocks', async (t) => {
  const source = `
    function foo() {
      try {
        doSomething();
      } catch (e) {
        handleError(e);
      }
    }
  `;
  const complexity = calculate_cyclomatic_complexity(source, 'javascript');
  t.assert.ok(complexity >= 2, 'Should count catch blocks');
});

// ============ calculate_nesting_depth tests ============

await test('calculate_nesting_depth returns 0 for empty source', async (t) => {
  t.assert.eq(calculate_nesting_depth(''), 0, 'Empty string should return 0');
  t.assert.eq(calculate_nesting_depth(null), 0, 'Null should return 0');
});

await test('calculate_nesting_depth counts brace depth for C-like languages', async (t) => {
  const source = `
    void foo() {
      if (x) {
        if (y) {
          if (z) {
            doSomething();
          }
        }
      }
    }
  `;
  const depth = calculate_nesting_depth(source);
  t.assert.ok(depth >= 4, 'Should count nested braces');
});

await test('calculate_nesting_depth handles unbalanced braces gracefully', async (t) => {
  const source = `{ { } } } }`;
  const depth = calculate_nesting_depth(source);
  t.assert.ok(depth >= 0, 'Should handle unbalanced braces without crashing');
});

await test('calculate_nesting_depth counts indentation for Python', async (t) => {
  const source = `
def foo():
    if x:
        if y:
            if z:
                doSomething()
`;
  const depth = calculate_nesting_depth(source);
  t.assert.ok(depth >= 3, 'Should count indentation depth for Python');
});

// ============ calculate_loc tests ============

await test('calculate_loc returns 0 for empty source', async (t) => {
  t.assert.eq(calculate_loc(''), 0, 'Empty string should return 0');
  t.assert.eq(calculate_loc(null), 0, 'Null should return 0');
});

await test('calculate_loc counts non-blank lines', async (t) => {
  const source = `int foo() {
  return 1;
}`;
  const loc = calculate_loc(source);
  t.assert.eq(loc, 3, 'Should count 3 non-blank lines');
});

await test('calculate_loc skips blank lines', async (t) => {
  const source = `int foo() {

  return 1;

}`;
  const loc = calculate_loc(source);
  t.assert.eq(loc, 3, 'Should skip blank lines');
});

await test('calculate_loc skips single-line comments', async (t) => {
  const source = `int foo() {
  // This is a comment
  return 1; // inline comment counts
  # Python comment
}`;
  const loc = calculate_loc(source);
  t.assert.eq(loc, 3, 'Should skip comment-only lines');
});

await test('calculate_loc skips multi-line comment markers', async (t) => {
  const source = `int foo() {
  /*
   * Comment block
   */
  return 1;
}`;
  const loc = calculate_loc(source);
  t.assert.eq(loc, 3, 'Should skip multi-line comment markers');
});

// ============ calculate_parameter_count tests ============

await test('calculate_parameter_count returns 0 for empty parameters', async (t) => {
  t.assert.eq(calculate_parameter_count(''), 0, 'Empty string should return 0');
  t.assert.eq(calculate_parameter_count(null), 0, 'Null should return 0');
  t.assert.eq(calculate_parameter_count('()'), 0, 'Empty parens should return 0');
  t.assert.eq(calculate_parameter_count('(void)'), 0, 'Void should return 0');
});

await test('calculate_parameter_count counts simple parameters', async (t) => {
  t.assert.eq(calculate_parameter_count('(int x)'), 1, 'Single param');
  t.assert.eq(calculate_parameter_count('(int x, int y)'), 2, 'Two params');
  t.assert.eq(calculate_parameter_count('(int x, int y, int z)'), 3, 'Three params');
});

await test('calculate_parameter_count handles nested generics', async (t) => {
  t.assert.eq(
    calculate_parameter_count('(Map<String, List<Integer>> map, int count)'),
    2,
    'Should handle nested generics'
  );
});

await test('calculate_parameter_count handles function pointers', async (t) => {
  t.assert.eq(
    calculate_parameter_count('(int (*callback)(int, int), int x)'),
    2,
    'Should handle function pointers'
  );
});

// ============ get_complexity_rating tests ============

await test('get_complexity_rating returns low for simple code', async (t) => {
  const rating = get_complexity_rating(3);
  t.assert.eq(rating.rating, 'low', 'Complexity 3 should be low');
  t.assert.eq(rating.label, 'Simple', 'Label should be Simple');
});

await test('get_complexity_rating returns moderate for medium complexity', async (t) => {
  const rating = get_complexity_rating(8);
  t.assert.eq(rating.rating, 'moderate', 'Complexity 8 should be moderate');
  t.assert.eq(rating.label, 'Moderate', 'Label should be Moderate');
});

await test('get_complexity_rating returns high for complex code', async (t) => {
  const rating = get_complexity_rating(15);
  t.assert.eq(rating.rating, 'high', 'Complexity 15 should be high');
  t.assert.eq(rating.label, 'Complex', 'Label should be Complex');
});

await test('get_complexity_rating returns very_high for very complex code', async (t) => {
  const rating = get_complexity_rating(25);
  t.assert.eq(rating.rating, 'very_high', 'Complexity 25 should be very_high');
  t.assert.eq(rating.label, 'Very Complex', 'Label should be Very Complex');
});

// ============ calculate_complexity tests ============

await test('calculate_complexity returns all metrics for an entity', async (t) => {
  const entity = {
    source: `int foo(int x, int y) {
      if (x > 0) {
        return x + y;
      }
      return 0;
    }`,
    parameters: '(int x, int y)',
    language: 'c'
  };

  const result = calculate_complexity(entity);

  t.assert.ok(result.cyclomatic >= 1, 'Should have cyclomatic complexity');
  t.assert.ok(result.nesting_depth >= 0, 'Should have nesting depth');
  t.assert.ok(result.loc >= 1, 'Should have loc');
  t.assert.eq(result.parameter_count, 2, 'Should have parameter count');
  t.assert.ok(result.rating, 'Should have rating');
  t.assert.ok(result.label, 'Should have label');
  t.assert.ok(result.color, 'Should have color');
});

await test('calculate_complexity uses default language c', async (t) => {
  const entity = {
    source: `if (x > 0) { return 1; }`,
    parameters: '(int x)'
  };

  const result = calculate_complexity(entity);
  t.assert.ok(result.cyclomatic >= 2, 'Should use C patterns by default');
});

// ============ calculate_aggregate_complexity tests ============

await test('calculate_aggregate_complexity returns zeros for empty array', async (t) => {
  const result = calculate_aggregate_complexity([]);

  t.assert.eq(result.total_functions, 0, 'Should have 0 functions');
  t.assert.eq(result.avg_cyclomatic, 0, 'Should have 0 avg cyclomatic');
  t.assert.eq(result.total_loc, 0, 'Should have 0 total loc');
});

await test('calculate_aggregate_complexity returns zeros for null', async (t) => {
  const result = calculate_aggregate_complexity(null);

  t.assert.eq(result.total_functions, 0, 'Should have 0 functions');
});

await test('calculate_aggregate_complexity calculates averages correctly', async (t) => {
  const entities = [
    { source: 'if (x) { return 1; }', parameters: '(int x)', language: 'c' },
    { source: 'if (x) { if (y) { return 1; } }', parameters: '(int x, int y)', language: 'c' },
    { source: 'return 1;', parameters: '()', language: 'c' }
  ];

  const result = calculate_aggregate_complexity(entities);

  t.assert.eq(result.total_functions, 3, 'Should count 3 functions');
  t.assert.ok(result.avg_cyclomatic > 0, 'Should have positive avg cyclomatic');
  t.assert.ok(result.max_cyclomatic >= result.avg_cyclomatic, 'Max should be >= avg');
  t.assert.ok(result.total_loc > 0, 'Should have positive total loc');
});

await test('calculate_aggregate_complexity tracks complexity distribution', async (t) => {
  const entities = [
    { source: 'return 1;', parameters: '()', language: 'c' }, // low
    { source: 'return 1;', parameters: '()', language: 'c' }, // low
    { source: 'if(a)if(b)if(c)if(d)if(e)if(f)if(g)return 1;', parameters: '()', language: 'c' } // higher
  ];

  const result = calculate_aggregate_complexity(entities);

  t.assert.ok(result.complexity_distribution, 'Should have distribution');
  t.assert.ok(result.complexity_distribution.low >= 0, 'Should track low');
  t.assert.ok(result.complexity_distribution.moderate >= 0, 'Should track moderate');
  t.assert.ok(result.complexity_distribution.high >= 0, 'Should track high');
  t.assert.ok(result.complexity_distribution.very_high >= 0, 'Should track very_high');
});
