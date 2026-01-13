'use strict';

/**
 * @fileoverview Jobs API routes.
 * Provides endpoints for monitoring background job queue status.
 * @module lib/api/v1/jobs
 */

import { get_job, get_jobs, get_queue_stats } from '../../jobs.mjs';

/**
 * Handler for GET /api/v1/jobs/{id} - get a specific job by ID.
 * @param {Object} request - Hapi request object
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Job object or 404 error
 */
const get_job_handler = async (request, h) => {
  const { id } = request.params;

  const job = get_job(id);
  if (!job) {
    return h.response({ error: `Job '${id}' not found` }).code(404);
  }

  return job;
};

/**
 * Handler for GET /api/v1/jobs - list jobs with optional filters.
 * @param {Object} request - Hapi request object
 * @param {Object} request.query - Query parameters
 * @param {string} [request.query.type] - Filter by job type
 * @param {string} [request.query.status] - Filter by job status
 * @param {string} [request.query.limit] - Maximum results to return
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object[]>} Array of job objects
 */
const list_jobs_handler = async (request, h) => {
  const { type, status, limit } = request.query;
  const jobs = get_jobs({
    type,
    status,
    limit: limit ? parseInt(limit, 10) : undefined
  });
  return jobs;
};

/**
 * Handler for GET /api/v1/jobs/stats - get queue statistics.
 * @param {Object} request - Hapi request object
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} Queue statistics object
 */
const queue_stats_handler = async (request, h) => {
  return get_queue_stats();
};

const get_job_route = {
  method: 'GET',
  path: '/api/v1/jobs/{id}',
  handler: get_job_handler
};

const list_jobs_route = {
  method: 'GET',
  path: '/api/v1/jobs',
  handler: list_jobs_handler
};

const queue_stats_route = {
  method: 'GET',
  path: '/api/v1/jobs/stats',
  handler: queue_stats_handler
};

const jobs = [queue_stats_route, get_job_route, list_jobs_route];

export { jobs, get_job_route, list_jobs_route, queue_stats_route };
