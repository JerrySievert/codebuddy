'use strict';

/**
 * @fileoverview Job queue system with worker thread support for background processing.
 * Jobs run in separate threads so they don't block the main event loop.
 * Supports queuing, status tracking, and automatic cleanup of old jobs.
 * @module lib/jobs
 */

import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const jobs = new Map();
const job_queue = [];
let active_workers = 0;
/** @type {number} Maximum number of concurrent worker threads */
const MAX_CONCURRENT_WORKERS = 1; // Limit to 1 to avoid DB connection issues

/** @type {Object|null} Hapi server reference for WebSocket broadcasting */
let ws_server = null;

/**
 * Set the WebSocket server reference for broadcasting job updates.
 * Called from server.mjs after nes plugin is registered.
 * @param {Object} server - Hapi server instance with nes plugin
 */
const set_web_socket_server = (server) => {
  ws_server = server;
  console.log('[WS] WebSocket server registered for job broadcasts');
};

/**
 * Broadcast a job update to all subscribed WebSocket clients.
 * @param {Object} job - The job object to broadcast
 */
const broadcast_job_update = (job) => {
  if (!ws_server) return;

  try {
    ws_server.publish(`/jobs/${job.id}`, job);
  } catch (error) {
    console.error(`[WS] Failed to broadcast job update:`, error.message);
  }
};

/**
 * Broadcast queue stats to all subscribed WebSocket clients.
 */
const broadcast_queue_stats = () => {
  if (!ws_server) return;

  try {
    ws_server.publish('/jobs/stats', get_queue_stats());
  } catch (error) {
    console.error(`[WS] Failed to broadcast queue stats:`, error.message);
  }
};

/**
 * Enum for job status values.
 * @readonly
 * @enum {string}
 */
const JobStatus = {
  /** Job is waiting in the queue */
  QUEUED: 'queued',
  /** Job is currently being processed */
  RUNNING: 'running',
  /** Job finished successfully */
  COMPLETED: 'completed',
  /** Job encountered an error */
  FAILED: 'failed'
};

/**
 * Create a new job and add it to the jobs registry.
 * @param {string} type - The job type (e.g., 'import', 'refresh')
 * @param {Object} [metadata={}] - Additional metadata for the job (e.g., project name)
 * @returns {Object} The created job object with id, status, and timestamps
 */
const create_job = (type, metadata = {}) => {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const job = {
    id,
    type,
    status: JobStatus.QUEUED,
    progress: 0,
    message: 'Queued...',
    metadata,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    result: null,
    error: null
  };
  jobs.set(id, job);

  // Broadcast new job and queue stats via WebSocket
  broadcast_job_update(job);
  broadcast_queue_stats();

  return job;
};

/**
 * Update a job's status and optional fields.
 * @param {string} id - The job ID to update
 * @param {Object} updates - Fields to update on the job
 * @param {string} [updates.status] - New status value
 * @param {number} [updates.progress] - Progress percentage (0-100)
 * @param {string} [updates.message] - Status message
 * @param {Object} [updates.result] - Result data on completion
 * @param {string} [updates.error] - Error message on failure
 * @returns {Object|null} The updated job object, or null if not found
 */
const update_job = (id, updates) => {
  const job = jobs.get(id);
  if (!job) return null;

  Object.assign(job, updates);

  // Broadcast update via WebSocket
  broadcast_job_update(job);

  // Broadcast queue stats if status changed
  if (updates.status) {
    broadcast_queue_stats();
  }

  return job;
};

/**
 * Get a job by its unique ID.
 * @param {string} id - The job ID to retrieve
 * @returns {Object|null} The job object, or null if not found
 */
const get_job = (id) => {
  return jobs.get(id) || null;
};

/**
 * Get all jobs, optionally filtered by type or status.
 * Results are sorted by creation date (newest first).
 * @param {Object} [options={}] - Filter options
 * @param {string} [options.type] - Filter by job type
 * @param {string} [options.status] - Filter by job status
 * @param {number} [options.limit] - Maximum number of jobs to return
 * @returns {Object[]} Array of matching job objects
 */
const get_jobs = ({ type, status, limit } = {}) => {
  let result = Array.from(jobs.values());

  if (type) {
    result = result.filter((j) => j.type === type);
  }
  if (status) {
    result = result.filter((j) => j.status === status);
  }

  // Sort by created_at descending (newest first)
  result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (limit) {
    result = result.slice(0, limit);
  }

  return result;
};

/**
 * Get statistics about the job queue.
 * @returns {Object} Queue statistics
 * @returns {number} returns.queued - Number of jobs waiting in queue
 * @returns {number} returns.running - Number of currently running jobs
 * @returns {number} returns.completed - Number of completed jobs
 * @returns {number} returns.failed - Number of failed jobs
 * @returns {number} returns.total - Total number of jobs in registry
 * @returns {number} returns.active_workers - Number of active worker threads
 * @returns {number} returns.max_workers - Maximum allowed concurrent workers
 */
const get_queue_stats = () => {
  const all_jobs = Array.from(jobs.values());
  return {
    queued: all_jobs.filter((j) => j.status === JobStatus.QUEUED).length,
    running: all_jobs.filter((j) => j.status === JobStatus.RUNNING).length,
    completed: all_jobs.filter((j) => j.status === JobStatus.COMPLETED).length,
    failed: all_jobs.filter((j) => j.status === JobStatus.FAILED).length,
    total: all_jobs.length,
    active_workers: active_workers,
    max_workers: MAX_CONCURRENT_WORKERS
  };
};

/**
 * Delete old completed/failed jobs from the registry.
 * Only removes jobs that have finished (completed or failed) and are older than maxAge.
 * @param {number} [maxAge=3600000] - Maximum age in milliseconds before cleanup (default 1 hour)
 * @returns {void}
 */
const cleanup_jobs = (max_age = 60 * 60 * 1000) => {
  const cutoff = Date.now() - max_age;

  for (const [id, job] of jobs.entries()) {
    if (
      (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) &&
      new Date(job.created_at).getTime() < cutoff
    ) {
      jobs.delete(id);
    }
  }
};

/**
 * Process the next job in the queue by spawning a worker thread.
 * Respects MAX_CONCURRENT_WORKERS limit and handles worker lifecycle events.
 * Called automatically when jobs are queued or when a worker exits.
 * @returns {void}
 * @private
 */
const process_next_job = () => {
  if (active_workers >= MAX_CONCURRENT_WORKERS) return;
  if (job_queue.length === 0) return;

  const { job_id, job_type, params } = job_queue.shift();
  const job = jobs.get(job_id);
  if (!job) return;

  active_workers++;
  console.log(
    `[JOB ${job_id}] Starting worker (${active_workers}/${MAX_CONCURRENT_WORKERS} active)...`
  );

  update_job(job_id, {
    status: JobStatus.RUNNING,
    started_at: new Date().toISOString(),
    message: 'Starting...'
  });

  const worker = new Worker(join(__dirname, 'worker.mjs'), {
    workerData: { jobType: job_type, params },
    // Set memory limits for worker threads to prevent OOM crashes
    // maxOldGenerationSizeMb: limit the V8 old generation (long-lived objects)
    // maxYoungGenerationSizeMb: limit the V8 young generation (short-lived objects)
    // Note: --expose-gc cannot be used in worker threads, so we rely on
    // setting variables to null and letting V8 handle GC naturally
    resourceLimits: {
      maxOldGenerationSizeMb: 4096, // 4GB for large repos
      maxYoungGenerationSizeMb: 512 // 512MB young generation
    }
  });

  worker.on('message', (msg) => {
    if (msg.type === 'progress') {
      update_job(job_id, {
        progress: msg.progress,
        message: msg.message
      });
    } else if (msg.type === 'complete') {
      console.log(`[JOB ${job_id}] Completed successfully`);
      update_job(job_id, {
        status: JobStatus.COMPLETED,
        completed_at: new Date().toISOString(),
        progress: 100,
        message: 'Completed',
        result: msg.result || {}
      });
    } else if (msg.type === 'error') {
      console.error(`[JOB ${job_id}] Failed:`, msg.error);
      update_job(job_id, {
        status: JobStatus.FAILED,
        completed_at: new Date().toISOString(),
        message: 'Failed',
        error: msg.error
      });
    }
  });

  worker.on('error', (error) => {
    console.error(`[JOB ${job_id}] Worker error:`, error.message);
    update_job(job_id, {
      status: JobStatus.FAILED,
      completed_at: new Date().toISOString(),
      message: 'Failed',
      error: error.message
    });
    // Don't let worker errors crash the main process
  });

  worker.on('messageerror', (error) => {
    console.error(`[JOB ${job_id}] Worker message error:`, error.message);
  });

  worker.on('exit', (code) => {
    active_workers--;
    console.log(
      `[JOB ${job_id}] Worker exited with code ${code} (${active_workers}/${MAX_CONCURRENT_WORKERS} active)`
    );

    // If job still shows as running (worker crashed before sending complete/error), mark as failed
    const current_job = jobs.get(job_id);
    if (current_job && current_job.status === JobStatus.RUNNING) {
      update_job(job_id, {
        status: JobStatus.FAILED,
        completed_at: new Date().toISOString(),
        message: 'Failed',
        error: `Worker exited unexpectedly with code ${code}`
      });
    }

    // Process next job in queue (use setImmediate to ensure state is updated)
    setImmediate(() => {
      process_next_job();
    });
  });
};

/**
 * Queue a job to run in a worker thread.
 * Returns immediately with the job object while processing happens in the background.
 * @param {string} type - The job type for display (e.g., 'import', 'refresh')
 * @param {Object} metadata - Additional metadata for the job (e.g., { name: 'project-name' })
 * @param {string} job_type - The worker job type that determines which function to execute
 * @param {Object} params - Parameters to pass to the worker function
 * @returns {Object} The created job object with id and initial status
 */
const queue_job = (type, metadata, job_type, params) => {
  const job = create_job(type, metadata);

  job_queue.push({
    job_id: job.id,
    job_type,
    params
  });

  console.log(`[JOB ${job.id}] Queued (${job_queue.length} in queue)`);

  // Try to start processing immediately
  process_next_job();

  return job;
};

export {
  JobStatus,
  create_job,
  update_job,
  get_job,
  get_jobs,
  get_queue_stats,
  cleanup_jobs,
  queue_job,
  set_web_socket_server
};
