'use strict';

/**
 * @fileoverview Functions list API route.
 * Lists all function symbols in a project.
 * @module lib/api/v1/functions/list
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { get_entity_symbols } from '../../../model/entity.mjs';

/**
 * Handler for GET /api/v1/functions - list functions in a project.
 * @param {Object} request - Hapi request object
 * @param {Object} request.query - Query parameters
 * @param {string} request.query.project - Project name (required)
 * @param {string} [request.query.filename] - Filter by filename
 * @param {string} [request.query.type] - Filter by entity type (function, class, struct). Default: all types
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object[]>} Array of function symbols, or error
 */
const list_handler = async (request, h) => {
  const { project, filename, type } = request.query;

  if (!project) {
    return h
      .response({ error: 'project query parameter is required' })
      .code(400);
  }

  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    return h.response({ error: `Project '${project}' not found` }).code(404);
  }

  const symbols = await get_entity_symbols({
    project_id: projects[0].id,
    filename,
    type: type || undefined  // If not specified, return all types
  });

  return symbols;
};

const list = {
  method: 'GET',
  path: '/api/v1/functions',
  handler: list_handler
};

export { list };
