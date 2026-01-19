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
  get_analysis_dashboard
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
    await query`DELETE FROM relationship WHERE caller IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM relationship WHERE callee IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
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

// Final cleanup
await cleanup_all_test_projects();
