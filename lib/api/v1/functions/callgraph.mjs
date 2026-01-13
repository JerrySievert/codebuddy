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
 * @param {string} [request.query.depth=3] - Maximum depth to traverse (max 5)
 * @param {string} [request.query.filename] - Filter by filename to disambiguate
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Graph with { root, nodes, edges }, or 404 error
 */
const callgraph_handler = async (request, h) => {
  const { name } = request.params;
  const { project, depth = 3, filename } = request.query;

  let project_id;
  if (project) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const graph = await build_call_graph({
    symbol: name,
    project_id,
    filename,
    max_depth: Math.min(parseInt(depth, 10) || 3, 5)
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
