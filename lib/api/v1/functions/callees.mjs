'use strict';

/**
 * @fileoverview Functions callees API route.
 * Returns functions that are called by a given function.
 * @module lib/api/v1/functions/callees
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { get_entities_by_caller_id } from '../../../model/relationship.mjs';

/**
 * Handler for GET /api/v1/functions/{name}/callees - get functions called by this function.
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Route parameters
 * @param {string} request.params.name - Function name to find callees for
 * @param {Object} request.query - Query parameters
 * @param {string} [request.query.project] - Filter by project name
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object[]>} Array of callee functions with relationship info
 */
const callees_handler = async (request, h) => {
  const { name } = request.params;
  const { project } = request.query;

  let project_id;
  if (project) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await get_entities_by_caller_id({
    project_id,
    symbol: name,
    type: 'function'
  });

  return results;
};

const callees = {
  method: 'GET',
  path: '/api/v1/functions/{name}/callees',
  handler: callees_handler
};

export { callees };
