'use strict';

/**
 * @fileoverview Tests for entity model functions.
 * Uses test fixtures created in the database for each test.
 */

import { test } from 'st';
import { query } from '../../../lib/db.mjs';
import { insert_or_update_project } from '../../../lib/model/project.mjs';
import {
  insert_or_update_entity,
  batch_insert_or_update_entities,
  clear_entities_for_project,
  entity_search,
  get_entity,
  get_entity_by_id,
  get_class_members,
  get_class_entities
} from '../../../lib/model/entity.mjs';

// Counter to ensure unique project names
let test_counter = 0;

/**
 * Clean up any leftover test projects from previous runs.
 */
const cleanup_all_test_projects = async () => {
  const projects =
    await query`SELECT id FROM project WHERE name LIKE '_test_entity_%'`;
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
 * Create test project.
 */
const setup_test_project = async () => {
  const test_id = ++test_counter;
  const project_name = `_test_entity_${test_id}_${Date.now()}`;

  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_entity_${test_id}`
  });
  return project_result[0].id;
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

// ============ insert_or_update_entity tests ============

await test('insert_or_update_entity creates new entity', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    const result = await insert_or_update_entity({
      project_id,
      symbol: 'test_function',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 1,
      end_line: 10,
      parameters: 'a, b',
      return_type: 'number',
      source: 'function test_function(a, b) { return a + b; }',
      comment: '// Test function'
    });

    t.assert.ok(result.length > 0, 'Should return created entity');
    t.assert.ok(result[0].id, 'Should have entity ID');
    t.assert.eq(
      result[0].symbol,
      'test_function',
      'Should have correct symbol'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('insert_or_update_entity updates existing entity', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    // Insert first
    const first = await insert_or_update_entity({
      project_id,
      symbol: 'update_test',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 1,
      end_line: 5,
      parameters: '',
      return_type: 'void',
      source: 'function update_test() {}',
      comment: null
    });

    // Update
    const second = await insert_or_update_entity({
      project_id,
      symbol: 'update_test',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 1,
      end_line: 10, // Changed
      parameters: 'x',
      return_type: 'number',
      source: 'function update_test(x) { return x; }',
      comment: '// Updated'
    });

    t.assert.eq(first[0].id, second[0].id, 'Should update same entity');
    t.assert.eq(second[0].end_line, 10, 'Should have updated end_line');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ batch_insert_or_update_entities tests ============

await test('batch_insert_or_update_entities inserts multiple entities', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    const entities = [
      {
        project_id,
        symbol: 'func_a',
        type: 'function',
        filename: 'test.js',
        language: 'javascript',
        start_line: 1,
        end_line: 5,
        parameters: '',
        return_type: 'void',
        source: 'function func_a() {}',
        comment: null
      },
      {
        project_id,
        symbol: 'func_b',
        type: 'function',
        filename: 'test.js',
        language: 'javascript',
        start_line: 7,
        end_line: 12,
        parameters: '',
        return_type: 'void',
        source: 'function func_b() {}',
        comment: null
      }
    ];

    const result = await batch_insert_or_update_entities(entities);

    t.assert.eq(result.length, 2, 'Should return both entities');
    t.assert.ok(result[0].id, 'First entity should have ID');
    t.assert.ok(result[1].id, 'Second entity should have ID');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ entity_search tests ============

await test('entity_search finds entities by symbol', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    await insert_or_update_entity({
      project_id,
      symbol: 'searchable_function',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 1,
      end_line: 5,
      parameters: '',
      return_type: 'void',
      source: 'function searchable_function() {}',
      comment: null
    });

    const result = await entity_search({
      symbol: 'searchable',
      project_id,
      filename: undefined,
      type: undefined,
      limit: 10
    });

    t.assert.ok(result.length > 0, 'Should find entities');
    const found = result.some((e) => e.symbol === 'searchable_function');
    t.assert.ok(found, 'Should find the searchable_function');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_entity tests ============

await test('get_entity retrieves entity by symbol and project', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    await insert_or_update_entity({
      project_id,
      symbol: 'get_me',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 1,
      end_line: 5,
      parameters: '',
      return_type: 'void',
      source: 'function get_me() {}',
      comment: null
    });

    const result = await get_entity({ symbol: 'get_me', project_id });

    t.assert.ok(result.length > 0, 'Should find entity');
    t.assert.eq(result[0].symbol, 'get_me', 'Should have correct symbol');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('get_entity returns empty for non-existent symbol', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    const result = await get_entity({
      symbol: 'non_existent_symbol_xyz',
      project_id
    });

    t.assert.eq(result.length, 0, 'Should return empty array for non-existent');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_entity_by_id tests ============

await test('get_entity_by_id retrieves entity by ID', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    const inserted = await insert_or_update_entity({
      project_id,
      symbol: 'by_id_test',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 1,
      end_line: 5,
      parameters: '',
      return_type: 'void',
      source: 'function by_id_test() {}',
      comment: null
    });

    const result = await get_entity_by_id(inserted[0].id);

    t.assert.ok(result, 'Should find entity');
    t.assert.eq(result.symbol, 'by_id_test', 'Should have correct symbol');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ clear_entities_for_project tests ============

await test('clear_entities_for_project removes all entities', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    // Insert some entities
    await insert_or_update_entity({
      project_id,
      symbol: 'to_clear_1',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 1,
      end_line: 5,
      parameters: '',
      return_type: 'void',
      source: 'function to_clear_1() {}',
      comment: null
    });

    await insert_or_update_entity({
      project_id,
      symbol: 'to_clear_2',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 7,
      end_line: 12,
      parameters: '',
      return_type: 'void',
      source: 'function to_clear_2() {}',
      comment: null
    });

    // Clear
    await clear_entities_for_project(project_id);

    // Verify cleared
    const remaining =
      await query`SELECT COUNT(*) as count FROM entity WHERE project_id = ${project_id}`;
    t.assert.eq(
      parseInt(remaining[0].count),
      0,
      'Should have no entities after clear'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_class_entities tests ============

await test('get_class_entities retrieves class entities', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    await insert_or_update_entity({
      project_id,
      symbol: 'MyClass',
      type: 'class',
      filename: 'test.js',
      language: 'javascript',
      start_line: 1,
      end_line: 20,
      parameters: '',
      return_type: '',
      source: 'class MyClass {}',
      comment: null
    });

    await insert_or_update_entity({
      project_id,
      symbol: 'myFunction',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 25,
      end_line: 30,
      parameters: '',
      return_type: 'void',
      source: 'function myFunction() {}',
      comment: null
    });

    const result = await get_class_entities({ project_id });

    t.assert.ok(result.length > 0, 'Should find class entities');
    const classes = result.filter((e) => e.type === 'class');
    t.assert.ok(classes.length > 0, 'Should include class type');
    t.assert.ok(
      classes.some((c) => c.symbol === 'MyClass'),
      'Should find MyClass'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// Final cleanup
await cleanup_all_test_projects();
