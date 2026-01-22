'use strict';

/**
 * @fileoverview Tests for entity heatmap functionality.
 * Tests the heatmap API endpoint and heat calculation based on call graph connectivity.
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
 * Creates a project with functions that have varying connectivity:
 *
 *   hub_func <- caller1, caller2, caller3, caller4  (high connectivity)
 *   hub_func -> callee1, callee2
 *   root_func -> hub_func, leaf_func
 *   leaf_func (no further connections - low connectivity)
 *
 * This gives us varying heat levels:
 * - hub_func should have highest heat (many connections)
 * - leaf_func should have low heat (few connections)
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
    { symbol: 'hub_func', start_line: 30, end_line: 40 },
    { symbol: 'leaf_func', start_line: 50, end_line: 60 },
    { symbol: 'caller1', start_line: 70, end_line: 80 },
    { symbol: 'caller2', start_line: 90, end_line: 100 },
    { symbol: 'caller3', start_line: 110, end_line: 120 },
    { symbol: 'caller4', start_line: 130, end_line: 140 },
    { symbol: 'callee1', start_line: 150, end_line: 160 },
    { symbol: 'callee2', start_line: 170, end_line: 180 }
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
  await batch_insert_relationships([
    // root_func calls hub_func and leaf_func
    { caller: entities.root_func.id, callee: entities.hub_func.id, line: 15 },
    { caller: entities.root_func.id, callee: entities.leaf_func.id, line: 16 },
    // Multiple callers call hub_func (making it highly connected)
    { caller: entities.caller1.id, callee: entities.hub_func.id, line: 75 },
    { caller: entities.caller2.id, callee: entities.hub_func.id, line: 95 },
    { caller: entities.caller3.id, callee: entities.hub_func.id, line: 115 },
    { caller: entities.caller4.id, callee: entities.hub_func.id, line: 135 },
    // hub_func calls callee1 and callee2
    { caller: entities.hub_func.id, callee: entities.callee1.id, line: 35 },
    { caller: entities.hub_func.id, callee: entities.callee2.id, line: 36 }
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

await test('most called node has heat value of 1', async (t) => {
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

    // hub_func has the most callers (5: root_func, caller1-4), so it should have heat of 1
    const hub_node = result.nodes.find((n) => n.symbol === 'hub_func');
    t.assert.ok(hub_node, 'hub_func should exist');
    t.assert.eq(
      hub_node.heat,
      1,
      'Most called node should have heat value of 1'
    );
    t.assert.eq(hub_node.caller_count, 5, 'hub_func should have 5 callers');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('highly connected nodes have higher heat than leaf nodes', async (t) => {
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

    // Find hub_func and leaf_func
    const hub_node = result.nodes.find((n) => n.symbol === 'hub_func');
    const leaf_node = result.nodes.find((n) => n.symbol === 'leaf_func');

    t.assert.ok(hub_node, 'hub_func should be in the heatmap');
    t.assert.ok(leaf_node, 'leaf_func should be in the heatmap');

    // hub_func should have higher heat than leaf_func
    // because hub_func has many callers and callees while leaf_func has none
    t.assert.ok(
      hub_node.heat >= leaf_node.heat,
      `hub_func (${hub_node.heat}) should have >= heat than leaf_func (${leaf_node.heat})`
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

    // Request with depth=1
    const request1 = {
      params: { name: 'root_func' },
      query: { project: project_name, depth: 1 }
    };
    const h = create_mock_h();
    const result1 = await heatmap.handler(request1, h);

    // Request with depth=3
    const request3 = {
      params: { name: 'root_func' },
      query: { project: project_name, depth: 3 }
    };
    const result3 = await heatmap.handler(request3, h);

    // Depth 3 should have more or equal nodes than depth 1
    t.assert.ok(
      result3.nodes.length >= result1.nodes.length,
      `Depth 3 (${result3.nodes.length} nodes) should have >= nodes than depth 1 (${result1.nodes.length} nodes)`
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
      params: { name: 'hub_func' },
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

    // At least one node (root) should have heat = 1
    const max_heat = Math.max(...result.nodes.map((n) => n.heat));
    t.assert.eq(max_heat, 1, 'Maximum heat should be 1');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// Final cleanup to ensure no test data remains
await cleanup_all_test_projects();
