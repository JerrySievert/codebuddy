'use strict';

/**
 * @fileoverview Project info API route.
 * Returns detailed information about a specific project including complexity metrics.
 * @module lib/api/v1/project/info
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { get_function_counts, get_entity } from '../../../model/entity.mjs';
import { calculate_aggregate_complexity } from '../../../complexity.mjs';

/**
 * Handler for GET /api/v1/projects/{name} - get project details.
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Route parameters
 * @param {string} request.params.name - Project name
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Project info with files and complexity metrics, or 404
 */
const info_handler = async (request, h) => {
  const { name } = request.params;
  const projects = await get_project_by_name({ name });

  if (projects.length === 0) {
    return h.response({ error: `Project '${name}' not found` }).code(404);
  }

  const project = projects[0];
  const filenames = await get_function_counts({ project_id: project.id });

  // Get all functions for complexity calculation
  const functions = await get_entity({
    project_id: project.id,
    type: 'function'
  });

  const complexity = calculate_aggregate_complexity(functions);

  return {
    ...project,
    files: filenames,
    complexity
  };
};

const info = {
  method: 'GET',
  path: '/api/v1/projects/{name}',
  handler: info_handler
};

export { info };
