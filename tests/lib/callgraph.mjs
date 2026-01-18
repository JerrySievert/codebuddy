'use strict';

/**
 * @fileoverview Tests for call graph depth filtering.
 * Tests that the build_call_graph function correctly returns depth information
 * and that filtering by depth produces correct results.
 *
 * Uses test fixtures created in the database for each test.
 */

import { test } from 'st';
import { query } from '../../lib/db.mjs';
import {
  build_call_graph,
  insert_relationship
} from '../../lib/model/relationship.mjs';
import { insert_or_update_project } from '../../lib/model/project.mjs';
import { insert_or_update_entity } from '../../lib/model/entity.mjs';

/**
 * Clean up any leftover test projects from previous runs.
 * This ensures a clean state even if previous tests crashed.
 */
const cleanup_all_test_projects = async () => {
  const projects =
    await query`SELECT id FROM project WHERE name LIKE '_test_callgraph_%'`;
  for (const p of projects) {
    await query`DELETE FROM relationship WHERE caller IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM relationship WHERE callee IN (SELECT id FROM entity WHERE project_id = ${p.id})`;
    await query`DELETE FROM entity WHERE project_id = ${p.id}`;
    await query`DELETE FROM project WHERE id = ${p.id}`;
  }
};

// Clean up any leftover test data before running tests
await cleanup_all_test_projects();

/**
 * Create test fixtures for call graph testing.
 * Creates a project with functions that have a call hierarchy:
 *
 *   caller_a -> root_func -> callee_a -> callee_a1
 *                         -> callee_b
 *   caller_b -> root_func
 *   caller_c -> caller_a
 *
 * This gives us:
 * - root_func at depth 0
 * - caller_a, caller_b, callee_a, callee_b at depth 1
 * - caller_c, callee_a1 at depth 2
 */
// Counter to ensure unique project names for each test
let test_counter = 0;

const setup_test_fixtures = async () => {
  const test_id = ++test_counter;
  const project_name = `_test_callgraph_${test_id}_${Date.now()}`;

  // Create test project with unique name
  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_callgraph_${test_id}`
  });
  const project_id = project_result[0].id;

  // Create test entities (functions)
  const entities = {};

  const function_defs = [
    { symbol: 'root_func', start_line: 10, end_line: 20 },
    { symbol: 'caller_a', start_line: 30, end_line: 40 },
    { symbol: 'caller_b', start_line: 50, end_line: 60 },
    { symbol: 'caller_c', start_line: 70, end_line: 80 },
    { symbol: 'callee_a', start_line: 90, end_line: 100 },
    { symbol: 'callee_b', start_line: 110, end_line: 120 },
    { symbol: 'callee_a1', start_line: 130, end_line: 140 }
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
  // caller_a calls root_func
  await insert_relationship({
    caller: entities.caller_a.id,
    callee: entities.root_func.id,
    line: 35
  });

  // caller_b calls root_func
  await insert_relationship({
    caller: entities.caller_b.id,
    callee: entities.root_func.id,
    line: 55
  });

  // caller_c calls caller_a
  await insert_relationship({
    caller: entities.caller_c.id,
    callee: entities.caller_a.id,
    line: 75
  });

  // root_func calls callee_a
  await insert_relationship({
    caller: entities.root_func.id,
    callee: entities.callee_a.id,
    line: 15
  });

  // root_func calls callee_b
  await insert_relationship({
    caller: entities.root_func.id,
    callee: entities.callee_b.id,
    line: 16
  });

  // callee_a calls callee_a1
  await insert_relationship({
    caller: entities.callee_a.id,
    callee: entities.callee_a1.id,
    line: 95
  });

  return { project_id, entities };
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

await test('build_call_graph returns edges with depth information', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;
    const entities = fixtures.entities;

    const graph = await build_call_graph({
      symbol: 'root_func',
      project_id,
      max_depth: 3
    });

    t.assert.ok(graph.root, 'Graph should have a root');
    t.assert.ok(graph.nodes.length > 0, 'Graph should have nodes');
    t.assert.ok(graph.edges.length > 0, 'Graph should have edges');

    // Check that edges have depth information
    const edges_with_callee_depth = graph.edges.filter(
      (e) => e.callee_depth !== null
    );
    const edges_with_caller_depth = graph.edges.filter(
      (e) => e.caller_depth !== null
    );

    t.assert.ok(
      edges_with_callee_depth.length > 0,
      'Some edges should have callee_depth'
    );
    t.assert.ok(
      edges_with_caller_depth.length > 0,
      'Some edges should have caller_depth'
    );

    // Verify all edges have at least one depth value
    for (const edge of graph.edges) {
      const has_depth =
        edge.callee_depth !== null || edge.caller_depth !== null;
      t.assert.ok(
        has_depth,
        `Edge ${edge.from}->${edge.to} should have at least one depth value`
      );
    }
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('build_call_graph depth=1 returns only direct callers and callees', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const graph = await build_call_graph({
      symbol: 'root_func',
      project_id,
      max_depth: 1
    });

    t.assert.ok(graph.root, 'Graph should have a root');

    // All edges should have depth 1
    for (const edge of graph.edges) {
      const valid =
        (edge.callee_depth !== null && edge.callee_depth === 1) ||
        (edge.caller_depth !== null && edge.caller_depth === 1);
      t.assert.ok(
        valid,
        `Edge should have depth 1, got callee_depth=${edge.callee_depth}, caller_depth=${edge.caller_depth}`
      );
    }

    // All edges should connect to the root
    for (const edge of graph.edges) {
      const connects_to_root =
        edge.from === graph.root || edge.to === graph.root;
      t.assert.ok(connects_to_root, `At depth 1, edge should connect to root`);
    }

    // Should have exactly 5 nodes: root + 2 callers + 2 callees
    t.assert.eq(graph.nodes.length, 5, 'Should have 5 nodes at depth 1');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('build_call_graph depth=2 includes depth 1 and 2 edges only', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const graph = await build_call_graph({
      symbol: 'root_func',
      project_id,
      max_depth: 2
    });

    t.assert.ok(graph.root, 'Graph should have a root');

    // All edges should have depth <= 2
    for (const edge of graph.edges) {
      const has_valid_depth =
        (edge.callee_depth !== null && edge.callee_depth <= 2) ||
        (edge.caller_depth !== null && edge.caller_depth <= 2);

      t.assert.ok(has_valid_depth, `Edge should have depth <= 2`);
    }

    // Should have all 7 nodes at depth 2
    t.assert.eq(graph.nodes.length, 7, 'Should have 7 nodes at depth 2');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('build_call_graph increasing depth includes more nodes', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const graph_1 = await build_call_graph({
      symbol: 'root_func',
      project_id,
      max_depth: 1
    });

    const graph_2 = await build_call_graph({
      symbol: 'root_func',
      project_id,
      max_depth: 2
    });

    t.assert.ok(
      graph_2.nodes.length >= graph_1.nodes.length,
      'Depth 2 should have >= nodes than depth 1'
    );
    t.assert.ok(
      graph_2.edges.length >= graph_1.edges.length,
      'Depth 2 should have >= edges than depth 1'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('callee_depth tracks downstream distance from root', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const graph = await build_call_graph({
      symbol: 'root_func',
      project_id,
      max_depth: 3
    });

    const root_id = graph.root;

    // Find direct callees (callee_depth = 1, edge.from = root)
    const direct_callees = graph.edges.filter(
      (e) => e.callee_depth === 1 && e.from === root_id
    );

    t.assert.ok(
      direct_callees.length > 0,
      'Root should have direct callees with callee_depth=1'
    );

    // Should have 2 direct callees (callee_a and callee_b)
    t.assert.eq(direct_callees.length, 2, 'Should have 2 direct callees');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('caller_depth tracks upstream distance from root', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const graph = await build_call_graph({
      symbol: 'root_func',
      project_id,
      max_depth: 3
    });

    const root_id = graph.root;

    // Find direct callers (caller_depth = 1, edge.to = root)
    const direct_callers = graph.edges.filter(
      (e) => e.caller_depth === 1 && e.to === root_id
    );

    t.assert.ok(
      direct_callers.length > 0,
      'Root should have direct callers with caller_depth=1'
    );

    // Should have 2 direct callers (caller_a and caller_b)
    t.assert.eq(direct_callers.length, 2, 'Should have 2 direct callers');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('depth filtering produces no orphan nodes', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const graph = await build_call_graph({
      symbol: 'root_func',
      project_id,
      max_depth: 2
    });

    // Collect all node IDs referenced by edges
    const edge_node_ids = new Set();
    edge_node_ids.add(graph.root);
    graph.edges.forEach((e) => {
      edge_node_ids.add(e.from);
      edge_node_ids.add(e.to);
    });

    // All nodes should be referenced by at least one edge
    const node_ids = new Set(graph.nodes.map((n) => n.id));

    // Check that all edge nodes are in the node list
    for (const edge_node_id of edge_node_ids) {
      t.assert.ok(
        node_ids.has(edge_node_id),
        `Edge node ${edge_node_id} should be in node list`
      );
    }

    // Check that all nodes are referenced by edges (no orphans except root)
    for (const node of graph.nodes) {
      if (node.id === graph.root) continue;
      t.assert.ok(
        edge_node_ids.has(node.id),
        `Node ${node.id} (${node.symbol}) should be referenced by at least one edge`
      );
    }
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('verify max depth constraint for callee direction', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const max_depth = 1;
    const graph = await build_call_graph({
      symbol: 'root_func',
      project_id,
      max_depth
    });

    // No edge should have callee_depth > max_depth
    const violations = graph.edges.filter(
      (e) => e.callee_depth !== null && e.callee_depth > max_depth
    );

    t.assert.eq(
      violations.length,
      0,
      `No edges should have callee_depth > ${max_depth}`
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('verify max depth constraint for caller direction', async (t) => {
  let project_id;
  try {
    const fixtures = await setup_test_fixtures();
    project_id = fixtures.project_id;

    const max_depth = 1;
    const graph = await build_call_graph({
      symbol: 'root_func',
      project_id,
      max_depth
    });

    // No edge should have caller_depth > max_depth
    const violations = graph.edges.filter(
      (e) => e.caller_depth !== null && e.caller_depth > max_depth
    );

    t.assert.eq(
      violations.length,
      0,
      `No edges should have caller_depth > ${max_depth}`
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// Final cleanup to ensure no test data remains
await cleanup_all_test_projects();
