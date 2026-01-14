'use strict';

/**
 * @fileoverview Functions caller tree API route.
 * Returns a tree of functions that call a given function, with configurable depth.
 * @module lib/api/v1/functions/caller_tree
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { build_caller_tree } from '../../../model/relationship.mjs';

/**
 * Handler for GET /api/v1/functions/{name}/caller-tree - get caller tree for a function.
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Route parameters
 * @param {string} request.params.name - Function name to build caller tree for
 * @param {Object} request.query - Query parameters
 * @param {string} request.query.project - Project name (required)
 * @param {number} [request.query.depth=1] - Depth of the tree (-1 for unlimited)
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Caller tree structure
 */
const caller_tree_handler = async (request, h) => {
  const { name } = request.params;
  const { project, depth = 1 } = request.query;

  if (!project) {
    return h
      .response({ error: 'Project name is required' })
      .code(400);
  }

  const projects = await get_project_by_name({ name: project });
  if (projects.length === 0) {
    return h
      .response({ error: `Project '${project}' not found` })
      .code(404);
  }

  const tree = await build_caller_tree({
    symbol: name,
    project_id: projects[0].id,
    depth: parseInt(depth, 10)
  });

  return tree;
};

const caller_tree = {
  method: 'GET',
  path: '/api/v1/functions/{name}/caller-tree',
  handler: caller_tree_handler
};

export { caller_tree };
