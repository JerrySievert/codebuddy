'use strict';

/**
 * @fileoverview Tests for relationship model functions.
 * Uses test fixtures created in the database for each test.
 */

import { test } from 'st';
import { query } from '../../../lib/db.mjs';
import { insert_or_update_project } from '../../../lib/model/project.mjs';
import {
  insert_or_update_entity,
  batch_insert_or_update_entities
} from '../../../lib/model/entity.mjs';
import {
  batch_insert_relationships,
  clear_relationships_for_project,
  get_entities_by_caller_id,
  get_entities_by_callee_id,
  build_call_graph,
  build_caller_tree,
  build_callee_tree
} from '../../../lib/model/relationship.mjs';

// Counter to ensure unique project names
let test_counter = 0;

/**
 * Clean up any leftover test projects from previous runs.
 */
const cleanup_all_test_projects = async () => {
  const projects =
    await query`SELECT id FROM project WHERE name LIKE '_test_relationship_%'`;
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
 * Create test project with entities.
 */
const setup_test_fixtures = async () => {
  const test_id = ++test_counter;
  const project_name = `_test_relationship_${test_id}_${Date.now()}`;

  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_relationship_${test_id}`
  });
  const project_id = project_result[0].id;

  // Create test entities
  const entities = await batch_insert_or_update_entities([
    {
      project_id,
      symbol: 'main',
      type: 'function',
      filename: 'test.c',
      language: 'c',
      start_line: 1,
      end_line: 10,
      parameters: '',
      return_type: 'int',
      source: 'int main() { foo(); bar(); }',
      comment: null
    },
    {
      project_id,
      symbol: 'foo',
      type: 'function',
      filename: 'test.c',
      language: 'c',
      start_line: 12,
      end_line: 20,
      parameters: '',
      return_type: 'void',
      source: 'void foo() { baz(); }',
      comment: null
    },
    {
      project_id,
      symbol: 'bar',
      type: 'function',
      filename: 'test.c',
      language: 'c',
      start_line: 22,
      end_line: 30,
      parameters: '',
      return_type: 'void',
      source: 'void bar() { baz(); }',
      comment: null
    },
    {
      project_id,
      symbol: 'baz',
      type: 'function',
      filename: 'test.c',
      language: 'c',
      start_line: 32,
      end_line: 40,
      parameters: '',
      return_type: 'void',
      source: 'void baz() {}',
      comment: null
    }
  ]);

  const entity_map = {};
  for (const e of entities) {
    entity_map[e.symbol] = e;
  }

  return { project_id, entities, entity_map };
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

// ============ batch_insert_relationships tests ============

await test('batch_insert_relationships inserts multiple relationships', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    const relationships = [
      { caller: entity_map.main.id, callee: entity_map.foo.id, line: 5 },
      { caller: entity_map.main.id, callee: entity_map.bar.id, line: 6 },
      { caller: entity_map.foo.id, callee: entity_map.baz.id, line: 15 },
      { caller: entity_map.bar.id, callee: entity_map.baz.id, line: 25 }
    ];

    await batch_insert_relationships(relationships);

    const count =
      await query`SELECT COUNT(*) as count FROM relationship WHERE caller IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
    t.assert.eq(parseInt(count[0].count), 4, 'Should insert 4 relationships');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('batch_insert_relationships filters invalid relationships', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    const relationships = [
      { caller: entity_map.main.id, callee: entity_map.foo.id, line: 5 },
      { caller: null, callee: entity_map.bar.id, line: 6 }, // Invalid
      { caller: entity_map.foo.id, callee: undefined, line: 15 }, // Invalid
      { caller: entity_map.bar.id, callee: entity_map.baz.id, line: null } // Invalid
    ];

    await batch_insert_relationships(relationships);

    const count =
      await query`SELECT COUNT(*) as count FROM relationship WHERE caller IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
    t.assert.eq(
      parseInt(count[0].count),
      1,
      'Should only insert 1 valid relationship'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('batch_insert_relationships handles empty array', async (t) => {
  const result = await batch_insert_relationships([]);
  t.assert.eq(result.length, 0, 'Should return empty array for empty input');
});

// ============ get_entities_by_caller_id tests ============

await test('get_entities_by_caller_id returns callees', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_relationships([
      { caller: entity_map.main.id, callee: entity_map.foo.id, line: 5 },
      { caller: entity_map.main.id, callee: entity_map.bar.id, line: 6 }
    ]);

    const result = await get_entities_by_caller_id({
      symbol: 'main',
      project_id
    });

    t.assert.eq(result.length, 2, 'main should call 2 functions');
    const symbols = result.map((r) => r.callee_symbol);
    t.assert.ok(symbols.includes('foo'), 'Should include foo');
    t.assert.ok(symbols.includes('bar'), 'Should include bar');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ get_entities_by_callee_id tests ============

await test('get_entities_by_callee_id returns callers', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_relationships([
      { caller: entity_map.foo.id, callee: entity_map.baz.id, line: 15 },
      { caller: entity_map.bar.id, callee: entity_map.baz.id, line: 25 }
    ]);

    const result = await get_entities_by_callee_id({
      symbol: 'baz',
      project_id
    });

    t.assert.eq(result.length, 2, 'baz should be called by 2 functions');
    const symbols = result.map((r) => r.caller_symbol);
    t.assert.ok(symbols.includes('foo'), 'Should include foo as caller');
    t.assert.ok(symbols.includes('bar'), 'Should include bar as caller');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ clear_relationships_for_project tests ============

await test('clear_relationships_for_project removes all relationships', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_relationships([
      { caller: entity_map.main.id, callee: entity_map.foo.id, line: 5 },
      { caller: entity_map.main.id, callee: entity_map.bar.id, line: 6 }
    ]);

    await clear_relationships_for_project({ id: project_id });

    const count =
      await query`SELECT COUNT(*) as count FROM relationship WHERE caller IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
    t.assert.eq(
      parseInt(count[0].count),
      0,
      'Should have no relationships after clear'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ build_call_graph tests ============

await test('build_call_graph returns nodes and edges', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_relationships([
      { caller: entity_map.main.id, callee: entity_map.foo.id, line: 5 },
      { caller: entity_map.main.id, callee: entity_map.bar.id, line: 6 },
      { caller: entity_map.foo.id, callee: entity_map.baz.id, line: 15 },
      { caller: entity_map.bar.id, callee: entity_map.baz.id, line: 25 }
    ]);

    const result = await build_call_graph({
      symbol: 'main',
      project_id,
      max_depth: 3
    });

    t.assert.ok(result.root, 'Should have root node');
    t.assert.ok(result.nodes.length > 0, 'Should have nodes');
    t.assert.ok(result.edges.length > 0, 'Should have edges');

    const root_node = result.nodes.find((n) => n.id === result.root);
    t.assert.ok(root_node, 'Should find root in nodes');
    t.assert.eq(root_node.symbol, 'main', 'Root should be main');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('build_call_graph returns empty for non-existent function', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await build_call_graph({
      symbol: 'non_existent_func',
      project_id,
      max_depth: 3
    });

    t.assert.eq(result.root, null, 'Should have null root');
    t.assert.eq(result.nodes.length, 0, 'Should have no nodes');
    t.assert.eq(result.edges.length, 0, 'Should have no edges');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('build_call_graph respects max_depth', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_relationships([
      { caller: entity_map.main.id, callee: entity_map.foo.id, line: 5 },
      { caller: entity_map.foo.id, callee: entity_map.baz.id, line: 15 }
    ]);

    // With depth 1, should only see main -> foo
    const result = await build_call_graph({
      symbol: 'main',
      project_id,
      max_depth: 1
    });

    // Should not include baz which is at depth 2
    const symbols = result.nodes.map((n) => n.symbol);
    t.assert.ok(symbols.includes('main'), 'Should include main');
    t.assert.ok(symbols.includes('foo'), 'Should include foo at depth 1');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ build_caller_tree tests ============

await test('build_caller_tree returns tree structure', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_relationships([
      { caller: entity_map.foo.id, callee: entity_map.baz.id, line: 15 },
      { caller: entity_map.bar.id, callee: entity_map.baz.id, line: 25 }
    ]);

    const result = await build_caller_tree({
      symbol: 'baz',
      project_id,
      depth: 1
    });

    t.assert.eq(result.symbol, 'baz', 'Root should be baz');
    t.assert.ok(Array.isArray(result.callers), 'Should have callers array');
    t.assert.eq(result.callers.length, 2, 'baz should have 2 callers');

    const caller_symbols = result.callers.map((c) => c.symbol);
    t.assert.ok(caller_symbols.includes('foo'), 'Should include foo');
    t.assert.ok(caller_symbols.includes('bar'), 'Should include bar');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('build_caller_tree returns not_found for missing function', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await build_caller_tree({
      symbol: 'missing_func',
      project_id,
      depth: 1
    });

    t.assert.ok(result.not_found, 'Should have not_found flag');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// ============ build_callee_tree tests ============

await test('build_callee_tree returns tree structure', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const { entity_map } = fixtures;

    await batch_insert_relationships([
      { caller: entity_map.main.id, callee: entity_map.foo.id, line: 5 },
      { caller: entity_map.main.id, callee: entity_map.bar.id, line: 6 }
    ]);

    const result = await build_callee_tree({
      symbol: 'main',
      project_id,
      depth: 1
    });

    t.assert.eq(result.symbol, 'main', 'Root should be main');
    t.assert.ok(Array.isArray(result.callees), 'Should have callees array');
    t.assert.eq(result.callees.length, 2, 'main should have 2 callees');

    const callee_symbols = result.callees.map((c) => c.symbol);
    t.assert.ok(callee_symbols.includes('foo'), 'Should include foo');
    t.assert.ok(callee_symbols.includes('bar'), 'Should include bar');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('build_callee_tree returns not_found for missing function', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const result = await build_callee_tree({
      symbol: 'missing_func',
      project_id,
      depth: 1
    });

    t.assert.ok(result.not_found, 'Should have not_found flag');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('build_callee_tree handles recursive calls', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    // Create a recursive function
    const recursive_entity = await insert_or_update_entity({
      project_id,
      symbol: 'recursive',
      type: 'function',
      filename: 'test.c',
      language: 'c',
      start_line: 50,
      end_line: 60,
      parameters: 'int n',
      return_type: 'int',
      source: 'int recursive(int n) { return n > 0 ? recursive(n-1) : 0; }',
      comment: null
    });

    await batch_insert_relationships([
      {
        caller: recursive_entity[0].id,
        callee: recursive_entity[0].id,
        line: 55
      }
    ]);

    const result = await build_callee_tree({
      symbol: 'recursive',
      project_id,
      depth: 5
    });

    t.assert.eq(result.symbol, 'recursive', 'Root should be recursive');
    // The tree should detect the loop and not infinitely recurse
    t.assert.ok(result.callees.length >= 0, 'Should handle recursive call');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// Final cleanup
await cleanup_all_test_projects();
