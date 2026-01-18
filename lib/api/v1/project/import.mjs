'use strict';

/**
 * @fileoverview Project import API route.
 * Handles importing new projects from local paths or git URLs.
 * @module lib/api/v1/project/import
 */

import { queue_job } from '../../../jobs.mjs';
import { is_read_only } from '../../../config.mjs';

/**
 * Handler for POST /api/v1/projects/import - import a new project.
 * Queues the import as a background job for async processing.
 * @param {Object} request - Hapi request object
 * @param {Object} request.payload - Request body
 * @param {string} [request.payload.name] - Project name (optional, derived from path if not provided)
 * @param {string} request.payload.path - Local file path or git URL (required)
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Job info with status 202 Accepted, or 400/403 error
 */
const import_handler = async (request, h) => {
  // Check for read-only mode
  if (is_read_only()) {
    return h
      .response({
        error: 'Server is in read-only mode. Import is disabled.'
      })
      .code(403);
  }

  const { name, path } = request.payload || {};

  if (!path) {
    return h
      .response({ error: 'path is required (local path or git URL)' })
      .code(400);
  }

  // Queue import as a background job in worker thread
  const job = queue_job('import', { path, name }, 'import', { name, path });

  return h
    .response({
      success: true,
      message: `Import queued for '${name || path}'`,
      job_id: job.id,
      status: job.status
    })
    .code(202); // 202 Accepted - request accepted for processing
};

const import_project = {
  method: 'POST',
  path: '/api/v1/projects/import',
  handler: import_handler
};

export { import_project };
