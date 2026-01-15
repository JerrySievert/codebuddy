'use strict';

/**
 * @fileoverview Worker thread for background job processing.
 * Runs in a separate thread to avoid blocking the main event loop.
 * Receives job instructions via workerData and reports progress via parentPort messages.
 * @module lib/worker
 */

import { workerData, parentPort } from 'worker_threads';
import { create_project, refresh_project } from './project.mjs';

/**
 * Send a progress update to the parent thread.
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} message - Status message to display
 */
const report_progress = (progress, message) => {
  parentPort.postMessage({ type: 'progress', progress, message });
};

/**
 * Send a completion message to the parent thread.
 * @param {Object} [result={}] - Optional result data to include
 */
const report_complete = (result = {}) => {
  parentPort.postMessage({ type: 'complete', result });
};

/**
 * Send an error message to the parent thread.
 * @param {string} error - Error message describing what went wrong
 */
const report_error = (error) => {
  parentPort.postMessage({ type: 'error', error });
};

/**
 * Execute the import_project job.
 * Creates a new project from a local path or git URL.
 * @param {Object} params - Job parameters
 * @param {string} params.path - Local file path or git URL to import
 * @param {string} [params.name] - Optional project name (auto-detected if not provided)
 * @returns {Promise<Object>} Result object with project name
 */
const run_import_project = async ({ path, name }) => {
  report_progress(10, 'Starting import...');
  console.log(`[WORKER] Import params - path: "${path}", name: "${name}"`);
  console.log(`[WORKER] Path type: ${typeof path}, length: ${path?.length}`);

  try {
    report_progress(20, 'Analyzing project...');
    const result = await create_project({ name, path });

    report_progress(90, 'Finalizing...');
    return { name: name || path };
  } catch (error) {
    throw error;
  }
};

/**
 * Execute the refresh_project job.
 * Re-parses all source files in an existing project.
 * For git projects, pulls the latest changes first.
 * @param {Object} params - Job parameters
 * @param {string} params.name - Name of the project to refresh
 * @returns {Promise<Object>} Result object with project name
 */
const run_refresh_project = async ({ name }) => {
  report_progress(10, 'Starting refresh...');

  try {
    report_progress(20, 'Re-analyzing project...');
    const result = await refresh_project({ name });

    report_progress(90, 'Finalizing...');
    return { name };
  } catch (error) {
    throw error;
  }
};

/**
 * Main worker entry point.
 * Dispatches to the appropriate job handler based on jobType.
 */
const main = async () => {
  const { jobType, params } = workerData;

  console.log(`[WORKER] Starting job type: ${jobType}`);

  try {
    let result;

    switch (jobType) {
      case 'import':
      case 'import_project':
        result = await run_import_project(params);
        break;

      case 'refresh':
      case 'refresh_project':
        result = await run_refresh_project(params);
        break;

      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    report_complete(result);
  } catch (error) {
    console.error(`[WORKER] Job failed:`, error.message);
    report_error(error.message);
  }

  // Exit the worker thread cleanly
  process.exit(0);
};

// Run the worker
main();
