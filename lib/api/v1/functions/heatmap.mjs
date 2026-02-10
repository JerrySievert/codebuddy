'use strict';

/**
 * @fileoverview Functions heatmap API route.
 * Builds a heatmap by getting the call graph for a function at a given depth,
 * then iterating through nodes and counting occurrences by ID.
 * @module lib/api/v1/functions/heatmap
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { build_call_graph } from '../../../model/relationship.mjs';

/**
 * Count nodes by iterating the call graph edges from root.
 * Builds an adjacency list, then walks the graph from root via BFS.
 * Each time a node is reached via an edge, its count is incremented.
 * @param {number} root_id - The root node ID
 * @param {Array} edges - Callee edges (from = caller, to = callee)
 * @returns {Map} Map of node ID to count
 */
const count_nodes_in_graph = (root_id, edges) => {
  const counts = new Map();

  // Build adjacency list: caller -> [callee_ids]
  const adj = new Map();
  edges.forEach((edge) => {
    if (!adj.has(edge.from)) {
      adj.set(edge.from, []);
    }
    adj.get(edge.from).push(edge.to);
  });

  // BFS from root, incrementing count for each node reached
  counts.set(root_id, 1);
  const queue = [root_id];
  const visited = new Set([root_id]);

  while (queue.length > 0) {
    const current = queue.shift();
    const children = adj.get(current) || [];
    for (const child_id of children) {
      counts.set(child_id, (counts.get(child_id) || 0) + 1);
      if (!visited.has(child_id)) {
        visited.add(child_id);
        queue.push(child_id);
      }
    }
  }

  return counts;
};

/**
 * Calculate heat values for nodes based on counts.
 * @param {Map} counts - Map of node ID to count
 * @returns {Map} Map of node ID to heat value (0-1)
 */
const calculate_heat_values = (counts) => {
  const heat_map = new Map();

  let max_count = 0;
  counts.forEach((count) => {
    if (count > max_count) max_count = count;
  });

  counts.forEach((count, id) => {
    heat_map.set(id, max_count > 0 ? count / max_count : 0);
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

  // Filter to only callee edges (downstream) within the requested depth
  const callee_edges = graph.edges.filter(
    (e) => e.callee_depth !== null && e.callee_depth <= max_depth
  );

  // Get node IDs reachable via callee edges
  const callee_node_ids = new Set();
  callee_node_ids.add(graph.root);
  callee_edges.forEach((e) => {
    callee_node_ids.add(e.from);
    callee_node_ids.add(e.to);
  });

  // Filter nodes to only downstream nodes
  const callee_nodes = graph.nodes.filter((n) => callee_node_ids.has(n.id));

  // Count nodes by walking the graph from root
  const node_counts = count_nodes_in_graph(graph.root, callee_edges);

  // Calculate heat values
  const heat_map = calculate_heat_values(node_counts);

  // Add heat and count to nodes
  const nodes_with_heat = callee_nodes.map((node) => ({
    ...node,
    heat: heat_map.get(node.id) || 0,
    caller_count: node_counts.get(node.id) || 0
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
