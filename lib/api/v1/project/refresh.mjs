'use strict';

/**
 * @fileoverview Project refresh API route.
 * Handles re-parsing and updating existing projects.
 * @module lib/api/v1/project/refresh
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { queue_job } from '../../../jobs.mjs';
import { is_read_only } from '../../../config.mjs';

/**
 * Handler for POST /api/v1/projects/{name}/refresh - refresh a project.
 * Queues the refresh as a background job for async processing.
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Route parameters
 * @param {string} request.params.name - Project name to refresh
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Job info with status 202 Accepted, or 403/404 error
 */
const refresh_handler = async (request, h) => {
  // Check for read-only mode
  if (is_read_only()) {
    return h
      .response({
        error: 'Server is in read-only mode. Refresh is disabled.'
      })
      .code(403);
  }

  const { name } = request.params;

  // Check if project exists
  const projects = await get_project_by_name({ name });
  if (projects.length === 0) {
    return h.response({ error: `Project '${name}' not found` }).code(404);
  }

  // Queue refresh as a background job in worker thread
  const job = queue_job('refresh', { name }, 'refresh', { name });

  return h
    .response({
      success: true,
      message: `Refresh queued for project '${name}'`,
      job_id: job.id,
      status: job.status
    })
    .code(202); // 202 Accepted - request accepted for processing
};

const refresh = {
  method: 'POST',
  path: '/api/v1/projects/{name}/refresh',
  handler: refresh_handler
};

export { refresh };
