'use strict';

/**
 * @fileoverview Functions retrieve API route.
 * Returns detailed information about a specific function.
 * @module lib/api/v1/functions/retrieve
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { get_entity } from '../../../model/entity.mjs';
import { calculate_complexity } from '../../../complexity.mjs';

/**
 * Handler for GET /api/v1/functions/{name} - get function details.
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Route parameters
 * @param {string} request.params.name - Function name to retrieve
 * @param {Object} request.query - Query parameters
 * @param {string} [request.query.project] - Filter by project name
 * @param {string} [request.query.filename] - Filter by filename
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object[]>} Array of matching functions with complexity metrics, or 404
 */
const retrieve_handler = async (request, h) => {
  const { name } = request.params;
  const { project, filename } = request.query;

  let project_id;
  if (project) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await get_entity({
    project_id,
    filename,
    symbol: name,
    type: 'function'
  });

  if (results.length === 0) {
    return h.response({ error: `Function '${name}' not found` }).code(404);
  }

  // Add complexity metrics to each result
  return results.map((entity) => ({
    ...entity,
    complexity: calculate_complexity(entity)
  }));
};

const retrieve = {
  method: 'GET',
  path: '/api/v1/functions/{name}',
  handler: retrieve_handler
};

export { retrieve };
