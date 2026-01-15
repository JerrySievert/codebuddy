'use strict';

/**
 * @fileoverview Entity definitions lookup API route.
 * Retrieves all definitions (struct/class) matching a name across all projects.
 * @module lib/api/v1/entities/definitions
 */

import { query } from '../../../db.mjs';
import { get_all_projects_with_metadata } from '../../../model/project.mjs';

/**
 * Handler for GET /api/v1/entities/definitions - get all definitions for a name across projects.
 * @param {Object} request - Hapi request object
 * @param {Object} request.query - Query parameters
 * @param {string} request.query.name - Entity name to lookup (required)
 * @param {string} [request.query.type] - Filter by entity type (struct, class)
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object[]>} Array of entity definitions with project info
 */
const definitions_handler = async (request, h) => {
  const { name, type } = request.query;

  if (!name) {
    return h
      .response({ error: 'name query parameter is required' })
      .code(400);
  }

  // Get all matching entities across all projects
  const typeFilter = type
    ? query`AND e.type = ${type}`
    : query`AND e.type IN ('struct', 'class')`;

  const entities = await query`
    SELECT
      e.id,
      e.symbol,
      e.type,
      e.filename,
      e.start_line,
      e.end_line,
      e.project_id
    FROM entity e
    WHERE e.symbol = ${name}
    ${typeFilter}
    ORDER BY e.project_id, e.filename, e.start_line
  `;

  // Add project names to results
  const all_projects = await get_all_projects_with_metadata();
  const project_map = new Map(all_projects.map(p => [p.project_id, p.name]));

  return entities.map(e => ({
    ...e,
    project_name: project_map.get(e.project_id) || 'Unknown'
  }));
};

const definitions = {
  method: 'GET',
  path: '/api/v1/entities/definitions',
  handler: definitions_handler
};

export { definitions };
