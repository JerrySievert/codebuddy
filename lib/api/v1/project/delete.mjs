'use strict';

/**
 * @fileoverview Project delete API route.
 * Handles permanent deletion of projects and all associated data.
 * @module lib/api/v1/project/delete
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { queue_job } from '../../../jobs.mjs';
import { is_read_only } from '../../../config.mjs';

/**
 * Handler for DELETE /api/v1/projects/{name} - delete a project.
 * Queues the deletion as a background job for async processing.
 * This permanently removes the project and all associated data including:
 * - All parsed entities (functions, classes, structs)
 * - All relationships (call graphs)
 * - All source code records
 * - All references and symbol references
 * - All inheritance data
 * - All cached analysis results
 *
 * @param {Object} request - Hapi request object
 * @param {Object} request.params - Route parameters
 * @param {string} request.params.name - Project name to delete
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Job info with status 202 Accepted, or 403/404 error
 */
const delete_handler = async (request, h) => {
  // Check for read-only mode
  if (is_read_only()) {
    return h
      .response({
        error: 'Server is in read-only mode. Delete is disabled.'
      })
      .code(403);
  }

  const { name } = request.params;

  // Check if project exists
  const projects = await get_project_by_name({ name });
  if (projects.length === 0) {
    return h.response({ error: `Project '${name}' not found` }).code(404);
  }

  const project = projects[0];

  // Queue delete as a background job in worker thread
  const job = queue_job('delete', { name }, 'delete', {
    name,
    project_id: project.id
  });

  return h
    .response({
      success: true,
      message: `Delete queued for project '${name}'`,
      job_id: job.id,
      status: job.status
    })
    .code(202); // 202 Accepted - request accepted for processing
};

const delete_project_route = {
  method: 'DELETE',
  path: '/api/v1/projects/{name}',
  handler: delete_handler
};

export { delete_project_route };
