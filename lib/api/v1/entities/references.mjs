'use strict';

/**
 * @fileoverview Entity references API route.
 * Retrieves all code locations where a struct or class is referenced.
 * @module lib/api/v1/entities/references
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { get_references_by_symbol } from '../../../model/reference.mjs';

/**
 * Handler for GET /api/v1/entities/{name}/references - get references to an entity.
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Path parameters
 * @param {string} request.params.name - Entity name (struct/class)
 * @param {Object} request.query - Query parameters
 * @param {string} request.query.project - Project name (required)
 * @param {string} [request.query.type] - Filter by reference type (variable, parameter, field, typedef, macro)
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object[]>} Array of reference records
 */
const references_handler = async (request, h) => {
  const { name } = request.params;
  const { project, type } = request.query;

  if (!project) {
    return h
      .response({ error: 'project query parameter is required' })
      .code(400);
  }

  const projects = await get_project_by_name({ name: project });
  if (projects.length === 0) {
    return h.response({ error: `Project '${project}' not found` }).code(404);
  }

  const references = await get_references_by_symbol({
    symbol: name,
    project_id: projects[0].id,
    reference_type: type
  });

  return references;
};

const references = {
  method: 'GET',
  path: '/api/v1/entities/{name}/references',
  handler: references_handler
};

export { references };
