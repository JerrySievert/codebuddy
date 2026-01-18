'use strict';

/**
 * @fileoverview Project info API route.
 * Returns detailed information about a specific project including complexity metrics.
 * @module lib/api/v1/project/info
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { get_project_analysis } from '../../../model/project_analysis.mjs';
import {
  calculate_and_store_complexity,
  calculate_and_store_files
} from '../../../project_analysis.mjs';

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

  // Fetch cached complexity and file list in parallel
  const [cachedComplexity, cachedFiles] = await Promise.all([
    get_project_analysis({
      project_id: project.id,
      analysis_type: 'complexity'
    }),
    get_project_analysis({
      project_id: project.id,
      analysis_type: 'files'
    })
  ]);

  // Use cached data if available, otherwise calculate and cache
  let complexity;
  if (cachedComplexity) {
    complexity = cachedComplexity.data;
  } else {
    complexity = await calculate_and_store_complexity(project.id);
  }

  let files;
  if (cachedFiles) {
    files = cachedFiles.data;
  } else {
    files = await calculate_and_store_files(project.id);
  }

  return {
    ...project,
    files,
    complexity
  };
};

const info = {
  method: 'GET',
  path: '/api/v1/projects/{name}',
  handler: info_handler
};

export { info };
