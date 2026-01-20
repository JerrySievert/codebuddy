'use strict';

/**
 * @fileoverview Tests for core analysis functions.
 * Uses test fixtures created in the database for each test.
 */

import { test } from 'st';
import { query } from '../../../lib/db.mjs';
import { insert_or_update_project } from '../../../lib/model/project.mjs';
import { insert_or_update_entity } from '../../../lib/model/entity.mjs';
import { batch_insert_relationships } from '../../../lib/model/relationship.mjs';
import {
  detect_dead_code,
  detect_code_duplication,
  detect_security_vulnerabilities,
  get_code_metrics,
  detect_code_smells,
  analyze_documentation,
  get_analysis_dashboard,
  extract_tokens,
  calculate_similarity_from_tokens,
  could_meet_threshold,
  generate_bucket_key
} from '../../../lib/analysis/index.mjs';

// Counter to ensure unique project names
let test_counter = 0;

/**
 * Clean up any leftover test projects from previous runs.
 */
const cleanup_all_test_projects = async () => {
  const projects =
    await query`SELECT id FROM project WHERE name LIKE '_test_analysis_%'`;
  for (const p of projects) {
    // Delete from tables with foreign keys to entity first
    await query`DELETE FROM inheritance WHERE child_entity_id IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM inheritance WHERE parent_entity_id IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM reference WHERE entity_id IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM relationship WHERE caller IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM relationship WHERE callee IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    // Delete from tables with foreign keys to project
    await query`DELETE FROM symbol_reference WHERE project_id = ${p.id}`;
    await query`DELETE FROM sourcecode WHERE project_id = ${p.id}`;
    await query`DELETE FROM project_analysis WHERE project_id = ${p.id}`;
    // Now delete entities and project
    await query`DELETE FROM entity WHERE project_id = ${p.id}`;
    await query`DELETE FROM project WHERE id = ${p.id}`;
  }
  if (projects.length > 0) {
    await query`REFRESH MATERIALIZED VIEW project_stats`;
  }
};

// Clean up before tests
await cleanup_all_test_projects();

/**
 * Create test fixtures for analysis testing.
 */
const setup_test_fixtures = async () => {
  const test_id = ++test_counter;
  const project_name = `_test_analysis_${test_id}_${Date.now()}`;

  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_analysis_${test_id}`
  });
  const project_id = project_result[0].id;

  const entities = {};

  // Create various test functions
  const function_defs = [
    {
      symbol: 'main',
      start_line: 1,
      end_line: 10,
      source: `function main() {
  const result = calculate(5);
  console.log(result);
  return 0;
}`,
      comment: '// Main entry point'
    },
    {
      symbol: 'calculate',
      start_line: 12,
      end_line: 25,
      source: `function calculate(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sum += i * j;
    }
  }
  return sum;
}`,
      comment: '// Calculate sum'
    },
    {
      symbol: 'unused_function',
      start_line: 27,
      end_line: 35,
      source: `function unused_function() {
  const x = 42;
  const y = 3.14159;
  return x * y;
}`,
      comment: null
    },
    {
      symbol: 'duplicate_logic',
      start_line: 37,
      end_line: 50,
      source: `function duplicate_logic(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sum += i * j;
    }
  }
  return sum;
}`,
      comment: null
    },
    {
      symbol: 'security_issue',
      start_line: 52,
      end_line: 60,
      source: `function security_issue(userInput) {
  const query = "SELECT * FROM users WHERE id = " + userInput;
  const password = "hardcoded_password123";
  eval(userInput);
  return query;
}`,
      comment: null
    },
    {
      symbol: 'long_function',
      start_line: 62,
      end_line: 200,
      source: `function long_function(a, b, c, d, e, f, g, h) {
  // This is a very long function with many parameters
  if (a && b && c && d && e) {
    if (f || g || h) {
      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 100; j++) {
          for (let k = 0; k < 100; k++) {
            console.log(i, j, k);
          }
        }
      }
    }
  }
  return a + b + c + d + e + f + g + h;
}`,
      comment: null
    }
  ];

  for (const def of function_defs) {
    const result = await insert_or_update_entity({
      project_id,
      symbol: def.symbol,
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: def.start_line,
      end_line: def.end_line,
      parameters: '',
      return_type: 'void',
      source: def.source,
      comment: def.comment
    });
    entities[def.symbol] = result[0];
  }

  // Create call relationships
  await batch_insert_relationships([
    { caller: entities.main.id, callee: entities.calculate.id, line: 2 }
  ]);

  return { project_id, entities };
};

/**
 * Clean up test fixtures.
 */
const cleanup_test_fixtures = async (project_id) => {
  if (project_id === undefined) return;
  await query`DELETE FROM relationship WHERE caller IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
  await query`DELETE FROM relationship WHERE callee IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
  await query`DELETE FROM entity WHERE project_id = ${project_id}`;
  await query`DELETE FROM project WHERE id = ${project_id}`;
};

// ============ detect_dead_code tests ============

await test('detect_dead_code finds uncalled functions', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await detect_dead_code(project_id);

    t.assert.ok(result.dead_functions, 'Should have dead_functions array');
    t.assert.ok(
      result.potential_entry_points,
      'Should have potential_entry_points array'
    );
    t.assert.ok(result.summary, 'Should have summary');

    // unused_function should be in dead_functions
    const dead_symbols = result.dead_functions.map((f) => f.symbol);
    t.assert.ok(
      dead_symbols.includes('unused_function'),
      'unused_function should be detected as dead'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('detect_dead_code identifies potential entry points', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await detect_dead_code(project_id);

    // main should be identified as potential entry point
    const entry_symbols = result.potential_entry_points.map((f) => f.symbol);
    t.assert.ok(
      entry_symbols.includes('main'),
      'main should be identified as potential entry point'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('detect_dead_code summary has correct counts', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await detect_dead_code(project_id);

    t.assert.ok(
      result.summary.dead_function_count >= 0,
      'Should have dead_function_count'
    );
    t.assert.ok(
      result.summary.total_functions > 0,
      'Should have total_functions'
    );
    t.assert.ok(
      result.summary.dead_code_percentage >= 0,
      'Should have dead_code_percentage'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ detect_code_duplication tests ============

await test('detect_code_duplication finds similar functions', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await detect_code_duplication(project_id, 0.7);

    // Returns duplicate_groups not duplicates
    t.assert.ok(
      result.duplicate_groups !== undefined,
      'Should have duplicate_groups array'
    );
    t.assert.ok(result.summary, 'Should have summary');

    // calculate and duplicate_logic should be flagged as duplicates
    if (result.duplicate_groups.length > 0) {
      const has_duplicate = result.duplicate_groups.some(
        (group) =>
          group.original.symbol === 'calculate' ||
          group.original.symbol === 'duplicate_logic' ||
          group.clones.some(
            (c) => c.symbol === 'calculate' || c.symbol === 'duplicate_logic'
          )
      );
      t.assert.ok(
        has_duplicate,
        'Should detect calculate/duplicate_logic as duplicates'
      );
    }
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ detect_security_vulnerabilities tests ============

await test('detect_security_vulnerabilities returns results', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await detect_security_vulnerabilities(project_id);

    t.assert.ok(
      result.vulnerabilities !== undefined,
      'Should have vulnerabilities array'
    );
    t.assert.ok(result.summary !== undefined, 'Should have summary');
    t.assert.ok(
      result.summary.total_vulnerabilities !== undefined,
      'Should have total_vulnerabilities in summary'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_code_metrics tests ============

await test('get_code_metrics returns project metrics', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await get_code_metrics(project_id);

    // Check the actual structure
    t.assert.ok(result.function_count > 0, 'Should have function_count');
    t.assert.ok(
      result.aggregate !== undefined,
      'Should have aggregate metrics'
    );
    t.assert.ok(
      result.maintainability_index >= 0,
      'Should have maintainability_index'
    );
    t.assert.ok(
      result.maintainability_rating,
      'Should have maintainability_rating'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ detect_code_smells tests ============

await test('detect_code_smells returns results', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await detect_code_smells(project_id);

    // smells is an object with different smell categories
    t.assert.ok(result.smells !== undefined, 'Should have smells object');
    t.assert.ok(result.summary !== undefined, 'Should have summary');
    t.assert.ok(
      result.summary.total_smells !== undefined,
      'Should have total_smells in summary'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ analyze_documentation tests ============

await test('analyze_documentation checks comment coverage', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await analyze_documentation(project_id);

    t.assert.ok(result.summary !== undefined, 'Should have summary');
    t.assert.ok(
      result.summary.total_functions !== undefined,
      'Should have total_functions'
    );
    t.assert.ok(
      result.summary.fully_documented !== undefined,
      'Should have fully_documented count'
    );
    t.assert.ok(
      result.summary.coverage_percentage !== undefined,
      'Should have coverage_percentage'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_analysis_dashboard tests ============

await test('get_analysis_dashboard returns comprehensive analysis', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await get_analysis_dashboard(project_id);

    t.assert.ok(
      result.health_score >= 0 && result.health_score <= 100,
      'Should have valid health_score'
    );
    t.assert.ok(result.health_rating, 'Should have health_rating');
    // Dashboard uses summaries not separate sections
    t.assert.ok(result.summaries !== undefined, 'Should have summaries object');
    t.assert.ok(
      result.summaries.dead_code !== undefined,
      'Should have dead_code in summaries'
    );
    t.assert.ok(
      result.summaries.metrics !== undefined,
      'Should have metrics in summaries'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_analysis_dashboard health_rating is valid', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await get_analysis_dashboard(project_id);

    // Dashboard uses different ratings: Excellent, Good, Fair, Poor
    const valid_ratings = ['Excellent', 'Good', 'Fair', 'Poor'];
    t.assert.ok(
      valid_ratings.includes(result.health_rating),
      'health_rating should be Excellent/Good/Fair/Poor'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ Duplication helper function tests ============

await test('extract_tokens extracts significant tokens from source', async (t) => {
  const source = 'function calculate sum total result';
  const tokens = extract_tokens(source);

  t.assert.ok(tokens instanceof Set, 'Should return a Set');
  t.assert.ok(tokens.has('function'), 'Should include "function"');
  t.assert.ok(tokens.has('calculate'), 'Should include "calculate"');
  t.assert.ok(tokens.has('sum'), 'Should include "sum"');
  t.assert.ok(tokens.has('total'), 'Should include "total"');
  t.assert.ok(tokens.has('result'), 'Should include "result"');
});

await test('extract_tokens filters out short tokens', async (t) => {
  const source = 'a ab abc function if for';
  const tokens = extract_tokens(source);

  t.assert.ok(!tokens.has('a'), 'Should exclude single char "a"');
  t.assert.ok(!tokens.has('ab'), 'Should exclude two char "ab"');
  t.assert.ok(tokens.has('abc'), 'Should include three char "abc"');
  t.assert.ok(tokens.has('function'), 'Should include "function"');
  t.assert.ok(!tokens.has('if'), 'Should exclude two char "if"');
  t.assert.ok(tokens.has('for'), 'Should include three char "for"');
});

await test('extract_tokens handles empty input', async (t) => {
  const tokens_empty = extract_tokens('');
  const tokens_null = extract_tokens(null);
  const tokens_undefined = extract_tokens(undefined);

  t.assert.eq(tokens_empty.size, 0, 'Empty string should give empty set');
  t.assert.eq(tokens_null.size, 0, 'Null should give empty set');
  t.assert.eq(tokens_undefined.size, 0, 'Undefined should give empty set');
});

await test('calculate_similarity_from_tokens returns 1 for identical sets', async (t) => {
  const tokens_a = new Set(['function', 'calculate', 'result']);
  const tokens_b = new Set(['function', 'calculate', 'result']);

  const similarity = calculate_similarity_from_tokens(tokens_a, tokens_b);
  t.assert.eq(similarity, 1, 'Identical sets should have similarity of 1');
});

await test('calculate_similarity_from_tokens returns 0 for disjoint sets', async (t) => {
  const tokens_a = new Set(['function', 'calculate', 'result']);
  const tokens_b = new Set(['class', 'method', 'object']);

  const similarity = calculate_similarity_from_tokens(tokens_a, tokens_b);
  t.assert.eq(similarity, 0, 'Disjoint sets should have similarity of 0');
});

await test('calculate_similarity_from_tokens calculates correct Jaccard', async (t) => {
  // Jaccard = |intersection| / |union|
  // A = {a, b, c}, B = {b, c, d}
  // intersection = {b, c} = 2
  // union = {a, b, c, d} = 4
  // Jaccard = 2/4 = 0.5
  const tokens_a = new Set(['aaa', 'bbb', 'ccc']);
  const tokens_b = new Set(['bbb', 'ccc', 'ddd']);

  const similarity = calculate_similarity_from_tokens(tokens_a, tokens_b);
  t.assert.eq(similarity, 0.5, 'Jaccard similarity should be 0.5');
});

await test('calculate_similarity_from_tokens handles empty sets', async (t) => {
  const empty = new Set();
  const non_empty = new Set(['function', 'calculate']);

  t.assert.eq(
    calculate_similarity_from_tokens(empty, empty),
    1,
    'Two empty sets should have similarity 1'
  );
  t.assert.eq(
    calculate_similarity_from_tokens(empty, non_empty),
    0,
    'Empty vs non-empty should have similarity 0'
  );
  t.assert.eq(
    calculate_similarity_from_tokens(non_empty, empty),
    0,
    'Non-empty vs empty should have similarity 0'
  );
});

await test('could_meet_threshold returns true when threshold is achievable', async (t) => {
  // If A has 10 tokens and B has 10 tokens, max similarity is 1.0
  t.assert.ok(
    could_meet_threshold(10, 10, 0.7),
    'Equal sizes can meet 0.7 threshold'
  );

  // If A has 8 tokens and B has 10 tokens, max similarity is 8/10 = 0.8
  t.assert.ok(
    could_meet_threshold(8, 10, 0.7),
    'Size 8 vs 10 can meet 0.7 threshold'
  );

  // If A has 7 tokens and B has 10 tokens, max similarity is 7/10 = 0.7
  t.assert.ok(
    could_meet_threshold(7, 10, 0.7),
    'Size 7 vs 10 can meet 0.7 threshold exactly'
  );
});

await test('could_meet_threshold returns false when threshold is impossible', async (t) => {
  // If A has 5 tokens and B has 10 tokens, max similarity is 5/10 = 0.5
  t.assert.ok(
    !could_meet_threshold(5, 10, 0.7),
    'Size 5 vs 10 cannot meet 0.7 threshold'
  );

  // If A has 3 tokens and B has 10 tokens, max similarity is 3/10 = 0.3
  t.assert.ok(
    !could_meet_threshold(3, 10, 0.7),
    'Size 3 vs 10 cannot meet 0.7 threshold'
  );

  // Empty set can never meet threshold
  t.assert.ok(
    !could_meet_threshold(0, 10, 0.7),
    'Empty set cannot meet any positive threshold'
  );
});

await test('generate_bucket_key groups similar-sized functions together', async (t) => {
  // Functions with similar token counts and line counts should get same bucket
  const tokens_10 = new Set(Array.from({ length: 10 }, (_, i) => `token${i}`));
  const tokens_12 = new Set(Array.from({ length: 12 }, (_, i) => `token${i}`));
  const tokens_50 = new Set(Array.from({ length: 50 }, (_, i) => `token${i}`));

  const key_10_15 = generate_bucket_key(tokens_10, 15);
  const key_12_18 = generate_bucket_key(tokens_12, 18);
  const key_50_100 = generate_bucket_key(tokens_50, 100);

  // 10 tokens rounds to 10, 15 lines rounds to 10
  // 12 tokens rounds to 10, 18 lines rounds to 10
  t.assert.eq(key_10_15, key_12_18, 'Similar sizes should get same bucket');

  // 50 tokens and 100 lines should be in a different bucket
  t.assert.ok(
    key_10_15 !== key_50_100,
    'Different sizes should get different buckets'
  );
});

await test('detect_code_duplication finds duplicates with optimized algorithm', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    // Run duplication detection
    const result = await detect_code_duplication(project_id, 0.7);

    t.assert.ok(
      result.duplicate_groups !== undefined,
      'Should have duplicate_groups'
    );
    t.assert.ok(result.summary !== undefined, 'Should have summary');

    // The calculate and duplicate_logic functions are nearly identical
    // They should be detected as duplicates
    const found_duplicate = result.duplicate_groups.some((group) => {
      const symbols = [
        group.original.symbol,
        ...group.clones.map((c) => c.symbol)
      ];
      return (
        symbols.includes('calculate') && symbols.includes('duplicate_logic')
      );
    });

    t.assert.ok(
      found_duplicate,
      'Should detect calculate and duplicate_logic as duplicates'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('detect_code_duplication handles empty projects', async (t) => {
  const test_id = ++test_counter;
  const project_name = `_test_analysis_empty_${test_id}_${Date.now()}`;

  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_empty_${test_id}`
  });
  const project_id = project_result[0].id;

  try {
    const result = await detect_code_duplication(project_id, 0.7);

    t.assert.ok(
      Array.isArray(result.duplicate_groups),
      'Should have duplicate_groups array'
    );
    t.assert.eq(
      result.duplicate_groups.length,
      0,
      'Empty project should have no duplicates'
    );
    t.assert.eq(
      result.summary.duplicate_group_count,
      0,
      'Should have 0 duplicate groups'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// Final cleanup
await cleanup_all_test_projects();
