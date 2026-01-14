'use strict';

/**
 * @fileoverview Functions search API route.
 * Provides fuzzy search for functions by name.
 * @module lib/api/v1/functions/search
 */

import { get_project_by_name, get_all_projects_with_metadata } from '../../../model/project.mjs';
import { entity_search } from '../../../model/entity.mjs';

/**
 * Handler for GET /api/v1/functions/search - search functions by name.
 * @param {Object} request - Hapi request object
 * @param {Object} request.query - Query parameters
 * @param {string} request.query.name - Function name to search for (required)
 * @param {string} [request.query.project] - Filter by project name
 * @param {string} [request.query.filename] - Filter by filename
 * @param {string} [request.query.limit=10] - Maximum results to return
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object[]>} Array of matching functions with similarity scores
 */
const search_handler = async (request, h) => {
  const { name, project, filename, limit = 10 } = request.query;

  if (!name) {
    return h
      .response({ error: 'name query parameter is required' })
      .code(400);
  }

  let project_id;
  if (project) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await entity_search({
    project_id,
    filename,
    symbol: name,
    type: 'function',
    limit: parseInt(limit, 10)
  });

  // If no project filter, add project names to results
  if (!project) {
    const all_projects = await get_all_projects_with_metadata();
    const project_map = new Map(all_projects.map(p => [p.project_id, p.name]));

    return results.map(r => ({
      ...r,
      project_name: project_map.get(r.project_id) || 'Unknown'
    }));
  }

  return results;
};

const search = {
  method: 'GET',
  path: '/api/v1/functions/search',
  handler: search_handler
};

export { search };
