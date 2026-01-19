'use strict';

/**
 * @fileoverview Worker thread for background job processing.
 * Runs in a separate thread to avoid blocking the main event loop.
 * Receives job instructions via workerData and reports progress via parentPort messages.
 * @module lib/worker
 */

import { workerData, parentPort } from 'worker_threads';
import { create_project, refresh_project } from './project.mjs';
import { run_all_precalculations } from './analysis/project_analysis.mjs';
import { get_project_by_name, delete_project } from './model/project.mjs';
import { create_partial_index_for_project } from './model/entity.mjs';

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
  report_progress(2, 'Starting import...');
  console.log(`[WORKER] Import params - path: "${path}", name: "${name}"`);
  console.log(`[WORKER] Path type: ${typeof path}, length: ${path?.length}`);

  try {
    // Pass progress callback to get real-time updates during parsing
    const result = await create_project({
      name,
      path,
      on_progress: report_progress
    });

    // Get the project ID for pre-calculations
    const project_name = name || path.split('/').pop();
    const projects = await get_project_by_name({ name: project_name });

    if (projects.length > 0) {
      const project_id = projects[0].id;

      report_progress(85, 'Pre-calculating analysis metrics...');
      await run_all_precalculations(project_id);

      report_progress(95, 'Optimizing indexes...');
      await create_partial_index_for_project(project_id);
    }

    report_progress(98, 'Finalizing...');
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
  report_progress(2, 'Starting refresh...');

  try {
    // Pass progress callback to get real-time updates during parsing
    const result = await refresh_project({
      name,
      on_progress: report_progress
    });

    // Get the project ID for pre-calculations
    const projects = await get_project_by_name({ name });

    if (projects.length > 0) {
      const project_id = projects[0].id;

      report_progress(85, 'Pre-calculating analysis metrics...');
      await run_all_precalculations(project_id);

      report_progress(95, 'Optimizing indexes...');
      await create_partial_index_for_project(project_id);
    }

    report_progress(98, 'Finalizing...');
    return { name };
  } catch (error) {
    throw error;
  }
};

/**
 * Execute the delete_project job.
 * Permanently removes a project and all associated data.
 * @param {Object} params - Job parameters
 * @param {string} params.name - Name of the project to delete
 * @param {number} params.project_id - ID of the project to delete
 * @returns {Promise<Object>} Result object with project name
 */
const run_delete_project = async ({ name, project_id }) => {
  report_progress(5, 'Starting deletion...');

  try {
    // Pass progress callback to get real-time updates during deletion
    // For large projects this can take a while due to relationships,
    // symbol references, inheritance records, and entities
    await delete_project(project_id, report_progress);

    report_progress(100, 'Project deleted successfully');
    return { name, deleted: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Main worker entry point.
 * Dispatches to the appropriate job handler based on jobType.
 */
const main = async () => {
  const { jobType: job_type, params } = workerData;

  console.log(`[WORKER] Starting job type: ${job_type}`);

  try {
    let result;

    switch (job_type) {
      case 'import':
      case 'import_project':
        result = await run_import_project(params);
        break;

      case 'refresh':
      case 'refresh_project':
        result = await run_refresh_project(params);
        break;

      case 'delete':
      case 'delete_project':
        result = await run_delete_project(params);
        break;

      default:
        throw new Error(`Unknown job type: ${job_type}`);
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
