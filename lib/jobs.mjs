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
const jobQueue = [];
let activeWorkers = 0;
/** @type {number} Maximum number of concurrent worker threads */
const MAX_CONCURRENT_WORKERS = 1;  // Limit to 1 to avoid DB connection issues

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
    result = result.filter(j => j.type === type);
  }
  if (status) {
    result = result.filter(j => j.status === status);
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
  const allJobs = Array.from(jobs.values());
  return {
    queued: allJobs.filter(j => j.status === JobStatus.QUEUED).length,
    running: allJobs.filter(j => j.status === JobStatus.RUNNING).length,
    completed: allJobs.filter(j => j.status === JobStatus.COMPLETED).length,
    failed: allJobs.filter(j => j.status === JobStatus.FAILED).length,
    total: allJobs.length,
    active_workers: activeWorkers,
    max_workers: MAX_CONCURRENT_WORKERS
  };
};

/**
 * Delete old completed/failed jobs from the registry.
 * Only removes jobs that have finished (completed or failed) and are older than maxAge.
 * @param {number} [maxAge=3600000] - Maximum age in milliseconds before cleanup (default 1 hour)
 * @returns {void}
 */
const cleanup_jobs = (maxAge = 60 * 60 * 1000) => {
  const cutoff = Date.now() - maxAge;

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
const processNextJob = () => {
  if (activeWorkers >= MAX_CONCURRENT_WORKERS) return;
  if (jobQueue.length === 0) return;

  const { jobId, jobType, params } = jobQueue.shift();
  const job = jobs.get(jobId);
  if (!job) return;

  activeWorkers++;
  console.log(`[JOB ${jobId}] Starting worker (${activeWorkers}/${MAX_CONCURRENT_WORKERS} active)...`);

  update_job(jobId, {
    status: JobStatus.RUNNING,
    started_at: new Date().toISOString(),
    message: 'Starting...'
  });

  const worker = new Worker(join(__dirname, 'worker.mjs'), {
    workerData: { jobType, params }
  });

  worker.on('message', (msg) => {
    if (msg.type === 'progress') {
      update_job(jobId, {
        progress: msg.progress,
        message: msg.message
      });
    } else if (msg.type === 'complete') {
      console.log(`[JOB ${jobId}] Completed successfully`);
      update_job(jobId, {
        status: JobStatus.COMPLETED,
        completed_at: new Date().toISOString(),
        progress: 100,
        message: 'Completed',
        result: msg.result || {}
      });
    } else if (msg.type === 'error') {
      console.error(`[JOB ${jobId}] Failed:`, msg.error);
      update_job(jobId, {
        status: JobStatus.FAILED,
        completed_at: new Date().toISOString(),
        message: 'Failed',
        error: msg.error
      });
    }
  });

  worker.on('error', (error) => {
    console.error(`[JOB ${jobId}] Worker error:`, error.message);
    update_job(jobId, {
      status: JobStatus.FAILED,
      completed_at: new Date().toISOString(),
      message: 'Failed',
      error: error.message
    });
    // Don't let worker errors crash the main process
  });

  worker.on('messageerror', (error) => {
    console.error(`[JOB ${jobId}] Worker message error:`, error.message);
  });

  worker.on('exit', (code) => {
    activeWorkers--;
    console.log(`[JOB ${jobId}] Worker exited with code ${code} (${activeWorkers}/${MAX_CONCURRENT_WORKERS} active)`);

    // If job still shows as running (worker crashed before sending complete/error), mark as failed
    const currentJob = jobs.get(jobId);
    if (currentJob && currentJob.status === JobStatus.RUNNING) {
      update_job(jobId, {
        status: JobStatus.FAILED,
        completed_at: new Date().toISOString(),
        message: 'Failed',
        error: `Worker exited unexpectedly with code ${code}`
      });
    }

    // Process next job in queue (use setImmediate to ensure state is updated)
    setImmediate(() => {
      processNextJob();
    });
  });
};

/**
 * Queue a job to run in a worker thread.
 * Returns immediately with the job object while processing happens in the background.
 * @param {string} type - The job type for display (e.g., 'import', 'refresh')
 * @param {Object} metadata - Additional metadata for the job (e.g., { name: 'project-name' })
 * @param {string} jobType - The worker job type that determines which function to execute
 * @param {Object} params - Parameters to pass to the worker function
 * @returns {Object} The created job object with id and initial status
 */
const queue_job = (type, metadata, jobType, params) => {
  const job = create_job(type, metadata);

  jobQueue.push({
    jobId: job.id,
    jobType,
    params
  });

  console.log(`[JOB ${job.id}] Queued (${jobQueue.length} in queue)`);

  // Try to start processing immediately
  processNextJob();

  return job;
};

/**
 * Run a function as a job in the main thread (legacy API).
 * Unlike queue_job, this runs in the main event loop using setImmediate.
 * @param {string} type - The job type for display
 * @param {Object} metadata - Additional metadata for the job
 * @param {Function} fn - Async function to execute, receives a progress callback (progress, message) => void
 * @returns {Promise<Object>} The created job object
 * @deprecated Use queue_job for true background processing with worker threads
 */
const run_as_job = async (type, metadata, fn) => {
  // This is kept for any code that still uses the old API
  // but we should migrate to queue_job
  const job = create_job(type, metadata);

  setImmediate(() => {
    (async () => {
      update_job(job.id, {
        status: JobStatus.RUNNING,
        started_at: new Date().toISOString(),
        message: 'Running...'
      });

      try {
        const result = await fn((progress, message) => {
          update_job(job.id, { progress, message });
        });

        update_job(job.id, {
          status: JobStatus.COMPLETED,
          completed_at: new Date().toISOString(),
          progress: 100,
          message: 'Completed',
          result
        });
      } catch (error) {
        update_job(job.id, {
          status: JobStatus.FAILED,
          completed_at: new Date().toISOString(),
          message: 'Failed',
          error: error.message
        });
      }
    })();
  });

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
  run_as_job
};
