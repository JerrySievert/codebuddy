'use strict';

/**
 * @fileoverview Functions heatmap API route.
 * Builds a heatmap based on static call count (how many callers each function has).
 * @module lib/api/v1/functions/heatmap
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { build_call_graph } from '../../../model/relationship.mjs';
import { query } from '../../../db.mjs';

/**
 * Get the actual caller count for each entity from the database.
 * This counts ALL callers in the project, not just within the subgraph.
 * @param {Array} node_ids - Array of entity IDs to get caller counts for
 * @returns {Promise<Map>} Map of entity ID to caller count
 */
const get_caller_counts = async (node_ids) => {
  if (node_ids.length === 0) {
    return new Map();
  }

  const results = await query`
    SELECT callee AS entity_id, COUNT(*) AS caller_count
    FROM relationship
    WHERE callee = ANY(${node_ids}::int[])
    GROUP BY callee
  `;

  const counts = new Map();
  results.forEach((row) => {
    counts.set(row.entity_id, parseInt(row.caller_count, 10));
  });

  return counts;
};

/**
 * Calculate heat values for nodes based on caller count.
 * @param {Map} caller_counts - Map of entity ID to caller count
 * @returns {Map} Map of entity ID to heat value (0-1)
 */
const calculate_heat_values = (caller_counts) => {
  const heat_map = new Map();

  // Find max caller count for normalization
  let max_callers = 0;
  caller_counts.forEach((count) => {
    if (count > max_callers) max_callers = count;
  });

  // Normalize to 0-1 range
  caller_counts.forEach((count, id) => {
    if (max_callers > 0) {
      heat_map.set(id, count / max_callers);
    } else {
      heat_map.set(id, 0);
    }
  });

  return heat_map;
};

/**
 * Handler for GET /api/v1/functions/{name}/heatmap - build heatmap for a function.
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Route parameters
 * @param {string} request.params.name - Function name to center heatmap on
 * @param {Object} request.query - Query parameters
 * @param {string} [request.query.project] - Filter by project name
 * @param {string} [request.query.depth=3] - Maximum depth to traverse (min 1, 0 for unlimited)
 * @param {string} [request.query.filename] - Filter by filename to disambiguate
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Heatmap with { root, nodes, edges }, or 404 error
 */
const heatmap_handler = async (request, h) => {
  const { name } = request.params;
  const { project, depth = 3, filename } = request.query;

  let project_id;
  if (project) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  // Parse depth: 0 means unlimited, otherwise min 1
  let max_depth = parseInt(depth, 10);
  if (isNaN(max_depth)) max_depth = 3;
  if (max_depth !== 0 && max_depth < 1) max_depth = 1;
  // For unlimited (0), use a large number
  if (max_depth === 0) max_depth = 100;

  const graph = await build_call_graph({
    symbol: name,
    project_id,
    filename,
    max_depth
  });

  if (!graph.root) {
    return h.response({ error: `Function '${name}' not found` }).code(404);
  }

  // Filter to only include callee edges (downstream - what root calls)
  // Exclude caller edges (upstream - what calls root)
  const callee_edges = graph.edges.filter((e) => e.callee_depth !== null);

  // Get node IDs that are reachable via callee edges (downstream only)
  const callee_node_ids = new Set();
  callee_node_ids.add(graph.root); // Always include root
  callee_edges.forEach((e) => {
    callee_node_ids.add(e.from);
    callee_node_ids.add(e.to);
  });

  // Filter nodes to only include downstream nodes
  const callee_nodes = graph.nodes.filter((n) => callee_node_ids.has(n.id));

  // Get actual caller counts from database for callee nodes
  const node_ids = callee_nodes.map((n) => n.id);
  const caller_counts = await get_caller_counts(node_ids);

  // Calculate heat values based on caller counts
  const heat_map = calculate_heat_values(caller_counts);

  // Add heat values and caller counts to nodes
  const nodes_with_heat = callee_nodes.map((node) => ({
    ...node,
    heat: heat_map.get(node.id) || 0,
    caller_count: caller_counts.get(node.id) || 0
  }));

  return {
    root: graph.root,
    nodes: nodes_with_heat,
    edges: callee_edges
  };
};

const heatmap = {
  method: 'GET',
  path: '/api/v1/functions/{name}/heatmap',
  handler: heatmap_handler
};

export { heatmap };
