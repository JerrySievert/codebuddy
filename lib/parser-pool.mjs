'use strict';

/**
 * @fileoverview Worker pool manager for parallel file parsing.
 * Manages a pool of worker threads that parse source files concurrently.
 * @module lib/parser-pool
 */

import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKER_PATH = join(__dirname, 'file-parser-worker.mjs');

/**
 * Default number of worker threads for parallel parsing.
 */
const DEFAULT_THREAD_COUNT = 3;

/**
 * Memory limit per worker thread in MB.
 * Helps prevent OOM crashes on large files.
 */
const WORKER_MEMORY_LIMIT_MB = 512;

/**
 * ParserPool manages a pool of worker threads for parallel file parsing.
 */
class ParserPool {
  /**
   * Create a new parser pool.
   * @param {number} thread_count - Number of worker threads to spawn
   */
  constructor(thread_count = DEFAULT_THREAD_COUNT) {
    this.thread_count = thread_count;
    this.workers = [];
    this.available_workers = [];
    this.pending_tasks = [];
    this.task_callbacks = new Map();
    this.initialized = false;
    this.terminated = false;
    this.task_id_counter = 0;
  }

  /**
   * Initialize the worker pool by spawning worker threads.
   */
  async init() {
    if (this.initialized) return;

    for (let i = 0; i < this.thread_count; i++) {
      const worker = new Worker(WORKER_PATH, {
        resourceLimits: {
          maxOldGenerationSizeMb: WORKER_MEMORY_LIMIT_MB,
          maxYoungGenerationSizeMb: WORKER_MEMORY_LIMIT_MB / 4
        }
      });

      worker.on('message', (result) => {
        this._handle_worker_result(worker, result);
      });

      worker.on('error', (error) => {
        console.error(`Parser worker error:`, error.message);
        // Remove failed worker and spawn a new one
        this._replace_worker(worker);
      });

      worker.on('exit', (code) => {
        if (code !== 0 && !this.terminated) {
          console.error(`Parser worker exited with code ${code}`);
          this._replace_worker(worker);
        }
      });

      this.workers.push(worker);
      this.available_workers.push(worker);
    }

    this.initialized = true;
  }

  /**
   * Replace a failed worker with a new one.
   * @private
   */
  _replace_worker(failed_worker) {
    // Remove from workers array
    const worker_index = this.workers.indexOf(failed_worker);
    if (worker_index !== -1) {
      this.workers.splice(worker_index, 1);
    }

    // Remove from available workers if present
    const available_index = this.available_workers.indexOf(failed_worker);
    if (available_index !== -1) {
      this.available_workers.splice(available_index, 1);
    }

    if (this.terminated) return;

    // Spawn a replacement worker with same resource limits
    const worker = new Worker(WORKER_PATH, {
      resourceLimits: {
        maxOldGenerationSizeMb: WORKER_MEMORY_LIMIT_MB,
        maxYoungGenerationSizeMb: WORKER_MEMORY_LIMIT_MB / 4
      }
    });

    worker.on('message', (result) => {
      this._handle_worker_result(worker, result);
    });

    worker.on('error', (error) => {
      console.error(`Parser worker error:`, error.message);
      this._replace_worker(worker);
    });

    worker.on('exit', (code) => {
      if (code !== 0 && !this.terminated) {
        console.error(`Parser worker exited with code ${code}`);
        this._replace_worker(worker);
      }
    });

    this.workers.push(worker);
    this.available_workers.push(worker);

    // Process any pending tasks
    this._process_next_task();
  }

  /**
   * Handle result from a worker thread.
   * @private
   */
  _handle_worker_result(worker, result) {
    // Find and call the callback for this result
    const task_id = result.taskId;
    const callback = this.task_callbacks.get(task_id);
    if (callback) {
      this.task_callbacks.delete(task_id);
      callback(result);
    }

    // Return worker to available pool
    this.available_workers.push(worker);

    // Process next pending task
    this._process_next_task();
  }

  /**
   * Process the next pending task if a worker is available.
   * @private
   */
  _process_next_task() {
    if (
      this.pending_tasks.length === 0 ||
      this.available_workers.length === 0
    ) {
      return;
    }

    const worker = this.available_workers.shift();
    const task = this.pending_tasks.shift();

    worker.postMessage(task.message);
  }

  /**
   * Parse a single file using a worker thread.
   * @param {string} absolute_filename - Absolute path to the file
   * @param {string} relative_filename - Relative path from project root
   * @param {number} project_id - Project ID
   * @returns {Promise<object>} Parse result
   */
  parse_file(absolute_filename, relative_filename, project_id) {
    return new Promise((resolve, reject) => {
      if (this.terminated) {
        reject(new Error('Parser pool has been terminated'));
        return;
      }

      const task_id = ++this.task_id_counter;

      const message = {
        type: 'parse',
        taskId: task_id,
        absoluteFilename: absolute_filename,
        relativeFilename: relative_filename,
        projectId: project_id
      };

      this.task_callbacks.set(task_id, resolve);

      if (this.available_workers.length > 0) {
        const worker = this.available_workers.shift();
        worker.postMessage(message);
      } else {
        this.pending_tasks.push({ message, resolve, reject });
      }
    });
  }

  /**
   * Parse multiple files with controlled concurrency.
   * Processes files in batches to avoid memory exhaustion.
   * @param {Array<{absoluteFilename: string, relativeFilename: string}>} files - Files to parse
   * @param {number} project_id - Project ID
   * @param {function} on_file_complete - Async callback called after each file completes: async (result, completed, total) => void
   * @returns {Promise<void>}
   */
  async parseFiles(files, project_id, on_file_complete = null) {
    if (!this.initialized) {
      await this.init();
    }

    const total = files.length;
    let completed_count = 0;
    let file_index = 0;

    // Process files using a sliding window of concurrent operations
    // Limited to thread_count * 2 to avoid memory buildup
    const max_concurrent = this.thread_count * 2;
    const in_flight = new Set();

    const process_next = async () => {
      if (file_index >= total) return null;

      const current_index = file_index++;
      const file = files[current_index];

      const result_promise = this.parse_file(
        file.absoluteFilename,
        file.relativeFilename,
        project_id
      ).then(async (result) => {
        completed_count++;
        in_flight.delete(result_promise);

        if (on_file_complete) {
          await on_file_complete(result, completed_count, total);
        }

        return result;
      });

      in_flight.add(result_promise);
      return result_promise;
    };

    // Start initial batch
    const initial_promises = [];
    for (let i = 0; i < Math.min(max_concurrent, total); i++) {
      initial_promises.push(process_next());
    }

    // Process remaining files as slots become available
    while (file_index < total || in_flight.size > 0) {
      if (in_flight.size === 0) break;

      // Wait for at least one to complete
      await Promise.race(in_flight);

      // Start new tasks to fill available slots
      while (in_flight.size < max_concurrent && file_index < total) {
        process_next();
      }
    }

    // Wait for any remaining in-flight tasks
    if (in_flight.size > 0) {
      await Promise.all(in_flight);
    }
  }

  /**
   * Terminate all worker threads.
   */
  async terminate() {
    this.terminated = true;

    const termination_promises = this.workers.map((worker) =>
      worker.terminate()
    );
    await Promise.all(termination_promises);

    this.workers = [];
    this.available_workers = [];
    this.pending_tasks = [];
    this.task_callbacks.clear();
    this.initialized = false;
  }

  /**
   * Get the number of active workers.
   */
  get active_worker_count() {
    return this.workers.length;
  }

  /**
   * Get the number of pending tasks.
   */
  get pending_task_count() {
    return this.pending_tasks.length;
  }
}

/**
 * Create a parser pool with the specified number of threads.
 * @param {number} thread_count - Number of worker threads
 * @returns {ParserPool} New parser pool instance
 */
const create_parser_pool = (thread_count = DEFAULT_THREAD_COUNT) => {
  return new ParserPool(thread_count);
};

export { ParserPool, create_parser_pool, DEFAULT_THREAD_COUNT };
