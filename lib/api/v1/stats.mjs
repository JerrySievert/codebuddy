'use strict';

/**
 * @fileoverview Global statistics API route.
 * Provides aggregated statistics across all projects.
 * @module lib/api/v1/stats
 */

import { query } from '../../db.mjs';

/**
 * Handler for GET /api/v1/stats - get global statistics.
 * Returns aggregated counts for projects, files, entities, and languages.
 * @param {Object} request - Hapi request object
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Statistics object
 */
const stats_handler = async (request, h) => {
  // Get project count
  const project_result = await query`
    SELECT COUNT(*) as count FROM project
  `;

  // Get total entity count
  const entity_result = await query`
    SELECT COUNT(*) as count FROM entity
  `;

  // Get total file count
  const file_result = await query`
    SELECT COUNT(*) as count FROM sourcecode
  `;

  // Get unique languages
  const language_result = await query`
    SELECT DISTINCT language FROM entity WHERE language IS NOT NULL
  `;

  return {
    projects: parseInt(project_result[0]?.count || 0),
    entities: parseInt(entity_result[0]?.count || 0),
    files: parseInt(file_result[0]?.count || 0),
    languages: language_result.map((r) => r.language).filter(Boolean)
  };
};

const stats = {
  method: 'GET',
  path: '/api/v1/stats',
  handler: stats_handler
};

export { stats };
