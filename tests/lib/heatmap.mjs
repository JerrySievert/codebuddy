'use strict';

/**
 * @fileoverview Tests for entity heatmap functionality.
 * Tests the heatmap API endpoint and heat calculation based on call graph connectivity.
 *
 * The heatmap works by:
 * 1. Starting at a root function
 * 2. Getting all callees (downstream) up to a set depth
 * 3. Counting how many times each function is called within that specific call tree
 * 4. Normalizing counts to heat values between 0 and 1
 *
 * Uses test fixtures created in the database for each test.
 */

import { test } from 'st';
import { query } from '../../lib/db.mjs';
import { batch_insert_relationships } from '../../lib/model/relationship.mjs';
import { insert_or_update_project } from '../../lib/model/project.mjs';
import { insert_or_update_entity } from '../../lib/model/entity.mjs';

/**
 * Clean up any leftover test projects from previous runs.
 */
const cleanup_all_test_projects = async () => {
  const projects =
    await query`SELECT id FROM project WHERE name LIKE '_test_heatmap_%'`;
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

// Clean up any leftover test data before running tests
await cleanup_all_test_projects();

/**
 * Create test fixtures for heatmap testing.
 * Creates a project with functions arranged so that some callees are reached
 * multiple times within the callee tree from root_func:
 *
 *   root_func -> branch_a -> shared_func -> deep_func
 *   root_func -> branch_b -> shared_func
 *   root_func -> branch_c -> shared_func
 *   root_func -> leaf_func  (no further calls)
 *
 * Call tree from root_func (callee direction):
 *   depth 1: branch_a, branch_b, branch_c, leaf_func
 *   depth 2: shared_func (called by branch_a, branch_b, branch_c => count 3)
 *   depth 3: deep_func (called by shared_func => count 1)
 *
 * Expected counts in the call tree:
 *   root_func:   1 (root)
 *   branch_a:    1 (called once by root_func)
 *   branch_b:    1 (called once by root_func)
 *   branch_c:    1 (called once by root_func)
 *   leaf_func:   1 (called once by root_func)
 *   shared_func: 3 (called by branch_a, branch_b, branch_c)  <- highest heat
 *   deep_func:   1 (called by shared_func)
 *
 * Heat values (normalized by max count of 3):
 *   shared_func: 1.0   (3/3)
 *   others:      0.333 (1/3)
 */
let test_counter = 0;

const setup_test_fixtures = async () => {
  const test_id = ++test_counter;
  const project_name = `_test_heatmap_${test_id}_${Date.now()}`;

  // Create test project with unique name
  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_heatmap_${test_id}`
  });
  const project_id = project_result[0].id;

  // Create test entities (functions)
  const entities = {};

  const function_defs = [
    { symbol: 'root_func', start_line: 10, end_line: 20 },
    { symbol: 'branch_a', start_line: 30, end_line: 40 },
    { symbol: 'branch_b', start_line: 50, end_line: 60 },
    { symbol: 'branch_c', start_line: 70, end_line: 80 },
    { symbol: 'leaf_func', start_line: 90, end_line: 100 },
    { symbol: 'shared_func', start_line: 110, end_line: 120 },
    { symbol: 'deep_func', start_line: 130, end_line: 140 }
  ];

  for (const def of function_defs) {
    const result = await insert_or_update_entity({
      project_id,
      symbol: def.symbol,
      type: 'function',
      filename: 'test.c',
      language: 'c',
      start_line: def.start_line,
      end_line: def.end_line,
      parameters: '',
      return_type: 'void',
      source: `void ${def.symbol}() { }`,
      comment: null
    });
    entities[def.symbol] = result[0];
  }

  // Create relationships (caller -> callee)
  // This creates a diamond/fan pattern where shared_func is called
  // by 3 different branches, all reachable from root_func
  await batch_insert_relationships([
    // root_func calls four functions at depth 1
    { caller: entities.root_func.id, callee: entities.branch_a.id, line: 12 },
    { caller: entities.root_func.id, callee: entities.branch_b.id, line: 13 },
    { caller: entities.root_func.id, callee: entities.branch_c.id, line: 14 },
    { caller: entities.root_func.id, callee: entities.leaf_func.id, line: 15 },
    // All three branches call shared_func (making it called 3 times in the tree)
    { caller: entities.branch_a.id, callee: entities.shared_func.id, line: 35 },
    { caller: entities.branch_b.id, callee: entities.shared_func.id, line: 55 },
    { caller: entities.branch_c.id, callee: entities.shared_func.id, line: 75 },
    // shared_func calls deep_func
    {
      caller: entities.shared_func.id,
      callee: entities.deep_func.id,
      line: 115
    }
  ]);

  return { project_id, entities, project_name };
};

/**
 * Clean up test fixtures
 */
const cleanup_test_fixtures = async (project_id) => {
  if (project_id === undefined) {
    return;
  }
  await query`DELETE FROM relationship WHERE caller IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
  await query`DELETE FROM relationship WHERE callee IN (SELECT id FROM entity WHERE project_id = ${project_id})`;
  await query`DELETE FROM entity WHERE project_id = ${project_id}`;
  await query`DELETE FROM project WHERE id = ${project_id}`;
};

// Import the heatmap handler for direct testing
import { heatmap } from '../../lib/api/v1/functions/heatmap.mjs';

// Create a mock Hapi response toolkit
const create_mock_h = () => ({
  response: (data) => ({
    code: (status_code) => ({ data, status_code })
  })
});

await test('heatmap endpoint returns nodes with heat values', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const project_name = fixtures.project_name;

    const request = {
      params: { name: 'root_func' },
      query: { project: project_name, depth: 3 }
    };
    const h = create_mock_h();

    const result = await heatmap.handler(request, h);

    t.assert.ok(result.root, 'Heatmap should have a root');
    t.assert.ok(result.nodes.length > 0, 'Heatmap should have nodes');

    // All nodes should have a heat value
    for (const node of result.nodes) {
      t.assert.ok(
        typeof node.heat === 'number',
        `Node ${node.symbol} should have a heat value`
      );
      t.assert.ok(
        node.heat >= 0 && node.heat <= 1,
        'Heat should be between 0 and 1'
      );
    }
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('most called node in call tree has heat value of 1', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const project_name = fixtures.project_name;

    const request = {
      params: { name: 'root_func' },
      query: { project: project_name, depth: 3 }
    };
    const h = create_mock_h();

    const result = await heatmap.handler(request, h);

    // shared_func is called by branch_a, branch_b, and branch_c in the callee tree
    // so it should have the highest count (3) and heat of 1
    const shared_node = result.nodes.find((n) => n.symbol === 'shared_func');
    t.assert.ok(shared_node, 'shared_func should exist in heatmap');
    t.assert.eq(
      shared_node.heat,
      1,
      'Most called node in call tree should have heat value of 1'
    );
    t.assert.eq(
      shared_node.caller_count,
      3,
      'shared_func should have caller_count of 3 (called by branch_a, branch_b, branch_c)'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('frequently called nodes have higher heat than single-call nodes', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const project_name = fixtures.project_name;

    const request = {
      params: { name: 'root_func' },
      query: { project: project_name, depth: 3 }
    };
    const h = create_mock_h();

    const result = await heatmap.handler(request, h);

    // Find shared_func (called 3 times) and leaf_func (called 1 time)
    const shared_node = result.nodes.find((n) => n.symbol === 'shared_func');
    const leaf_node = result.nodes.find((n) => n.symbol === 'leaf_func');

    t.assert.ok(shared_node, 'shared_func should be in the heatmap');
    t.assert.ok(leaf_node, 'leaf_func should be in the heatmap');

    // shared_func should have higher heat than leaf_func
    // because shared_func is called 3 times in the call tree while leaf_func is called once
    t.assert.ok(
      shared_node.heat > leaf_node.heat,
      `shared_func heat (${shared_node.heat}) should be > leaf_func heat (${leaf_node.heat})`
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('heatmap respects depth parameter', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const project_name = fixtures.project_name;

    // Request with depth=1 - should only get root_func's direct callees
    const request1 = {
      params: { name: 'root_func' },
      query: { project: project_name, depth: 1 }
    };
    const h = create_mock_h();
    const result1 = await heatmap.handler(request1, h);

    // Request with depth=3 - should get full tree
    const request3 = {
      params: { name: 'root_func' },
      query: { project: project_name, depth: 3 }
    };
    const result3 = await heatmap.handler(request3, h);

    // Depth 3 should have more nodes than depth 1
    t.assert.ok(
      result3.nodes.length > result1.nodes.length,
      `Depth 3 (${result3.nodes.length} nodes) should have more nodes than depth 1 (${result1.nodes.length} nodes)`
    );

    // Depth 1 should have root + 4 direct callees = 5 nodes
    t.assert.eq(
      result1.nodes.length,
      5,
      'Depth 1 should have 5 nodes (root + branch_a, branch_b, branch_c, leaf_func)'
    );

    // Depth 3 should include shared_func and deep_func too = 7 nodes
    t.assert.eq(
      result3.nodes.length,
      7,
      'Depth 3 should have 7 nodes (all functions)'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('heatmap returns 404 for non-existent function', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const project_name = fixtures.project_name;

    const request = {
      params: { name: 'non_existent_function' },
      query: { project: project_name, depth: 3 }
    };
    const h = create_mock_h();

    const result = await heatmap.handler(request, h);

    t.assert.ok(
      result.status_code,
      'Result should be a response with status code'
    );
    t.assert.eq(result.status_code, 404, 'Should return 404 status');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('heatmap includes edges from call graph', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const project_name = fixtures.project_name;

    const request = {
      params: { name: 'root_func' },
      query: { project: project_name, depth: 3 }
    };
    const h = create_mock_h();

    const result = await heatmap.handler(request, h);

    t.assert.ok(result.edges, 'Heatmap should include edges');
    t.assert.ok(result.edges.length > 0, 'Heatmap should have edges');

    // Edges should have from/to properties
    for (const edge of result.edges) {
      t.assert.ok(
        typeof edge.from === 'number',
        'Edge should have from property'
      );
      t.assert.ok(typeof edge.to === 'number', 'Edge should have to property');
    }

    // Should have 8 edges total matching the relationships we created
    t.assert.eq(
      result.edges.length,
      8,
      'Should have 8 edges in full call tree'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('heatmap heat values are normalized between 0 and 1', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const project_name = fixtures.project_name;

    const request = {
      params: { name: 'root_func' },
      query: { project: project_name, depth: 3 }
    };
    const h = create_mock_h();

    const result = await heatmap.handler(request, h);

    // All heat values should be between 0 and 1
    for (const node of result.nodes) {
      t.assert.ok(
        node.heat >= 0,
        `Node ${node.symbol} heat (${node.heat}) should be >= 0`
      );
      t.assert.ok(
        node.heat <= 1,
        `Node ${node.symbol} heat (${node.heat}) should be <= 1`
      );
    }

    // The max heat should be 1 (shared_func with count 3)
    const max_heat = Math.max(...result.nodes.map((n) => n.heat));
    t.assert.eq(max_heat, 1, 'Maximum heat should be 1');

    // Nodes called once should have heat = 1/3
    const leaf_node = result.nodes.find((n) => n.symbol === 'leaf_func');
    t.assert.ok(leaf_node, 'leaf_func should exist');
    const expected_heat = 1 / 3;
    t.assert.ok(
      Math.abs(leaf_node.heat - expected_heat) < 0.01,
      `leaf_func heat (${leaf_node.heat}) should be ~${expected_heat.toFixed(3)}`
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('depth 2 counts are correct for call tree', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const project_name = fixtures.project_name;

    // Depth 2 should include root_func, branches, leaf_func, and shared_func
    // but NOT deep_func (which is at depth 3)
    const request = {
      params: { name: 'root_func' },
      query: { project: project_name, depth: 2 }
    };
    const h = create_mock_h();

    const result = await heatmap.handler(request, h);

    // Should have 6 nodes: root_func, branch_a, branch_b, branch_c, leaf_func, shared_func
    t.assert.eq(result.nodes.length, 6, 'Depth 2 should have 6 nodes');

    // shared_func should still have count of 3 at depth 2
    const shared_node = result.nodes.find((n) => n.symbol === 'shared_func');
    t.assert.ok(shared_node, 'shared_func should be in depth 2 results');
    t.assert.eq(
      shared_node.caller_count,
      3,
      'shared_func should still have caller_count of 3 at depth 2'
    );

    // deep_func should NOT be in depth 2 results
    const deep_node = result.nodes.find((n) => n.symbol === 'deep_func');
    t.assert.ok(!deep_node, 'deep_func should not be in depth 2 results');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// Final cleanup to ensure no test data remains
await cleanup_all_test_projects();
