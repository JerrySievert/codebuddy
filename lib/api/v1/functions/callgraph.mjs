'use strict';

/**
 * @fileoverview Functions call graph API route.
 * Builds a bidirectional call graph centered on a function.
 * @module lib/api/v1/functions/callgraph
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { build_call_graph } from '../../../model/relationship.mjs';

/**
 * Handler for GET /api/v1/functions/{name}/callgraph - build call graph for a function.
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Route parameters
 * @param {string} request.params.name - Function name to center graph on
 * @param {Object} request.query - Query parameters
 * @param {string} [request.query.project] - Filter by project name
 * @param {string} [request.query.depth=10] - Maximum depth to traverse (min 2, 0 for unlimited)
 * @param {string} [request.query.filename] - Filter by filename to disambiguate
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Graph with { root, nodes, edges }, or 404 error
 */
const callgraph_handler = async (request, h) => {
  const { name } = request.params;
  const { project, depth = 10, filename } = request.query;

  let project_id;
  if (project) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  // Parse depth: 0 means unlimited, otherwise min 2
  let max_depth = parseInt(depth, 10);
  if (isNaN(max_depth)) max_depth = 10;
  if (max_depth !== 0 && max_depth < 2) max_depth = 2;
  // For unlimited (0), use a very large number that won't practically be reached
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

  return graph;
};

const callgraph = {
  method: 'GET',
  path: '/api/v1/functions/{name}/callgraph',
  handler: callgraph_handler
};

export { callgraph };
