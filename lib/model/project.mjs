'use strict';

/**
 * @fileoverview Project model for database operations.
 * Handles CRUD operations for projects and project statistics.
 * @module lib/model/project
 */

import { query } from '../db.mjs';

/**
 * Insert a new project or update an existing one by name.
 * @param {Object} project - The project data
 * @param {string} project.path - The project path (local or git URL)
 * @param {string} project.name - The unique project name
 * @param {string} [project.git_url] - Optional git URL for git-based projects
 * @returns {Promise<Object[]>} Array containing the inserted/updated project record
 * @throws {Error} If database operation fails
 */
const insert_or_update_project = async (project) => {
  try {
    const ret = await query`
    INSERT INTO project (
      path,
      name,
      git_url,
      created_at
    ) VALUES (
      ${project.path},
      ${project.name},
      ${project.git_url || null},
      CURRENT_TIMESTAMP
    ) ON CONFLICT (name) DO UPDATE SET
      updated_at = CURRENT_TIMESTAMP,
      git_url = COALESCE(${project.git_url || null}, project.git_url)
      RETURNING *
    `;

    return ret;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

/**
 * Get a project by its unique name.
 * @param {Object} params - Query parameters
 * @param {string} params.name - The project name to search for
 * @returns {Promise<Object[]>} Array of matching project records (typically 0 or 1)
 */
const get_project_by_name = async ({ name }) => {
  return await query`
    SELECT *
      FROM project
     WHERE name = ${name}
     ORDER BY name, path
    `;
};

/**
 * Get a project by its file path or git URL.
 * @param {Object} params - Query parameters
 * @param {string} params.path - The project path to search for
 * @returns {Promise<Object[]>} Array of matching project records (typically 0 or 1)
 */
const get_project_by_path = async ({ path }) => {
  return await query`
    SELECT *
      FROM project
     WHERE path = ${path}
     ORDER BY name, path
    `;
};

/**
 * Get a project by its database ID.
 * @param {number} id - The project ID
 * @returns {Promise<Object|undefined>} The project record, or undefined if not found
 */
const get_project_by_id = async (id) => {
  const projects = await query`
    SELECT *
      FROM project
     WHERE id = ${id}
    `;

  return projects[0];
};

/**
 * Get all projects with their computed statistics from the materialized view.
 * Includes entity counts, file counts, and other aggregated metadata.
 * @returns {Promise<Object[]>} Array of project records with statistics
 */
const get_all_projects_with_metadata = async () => {
  const results = await query`
    SELECT *
      FROM project_stats
    `;

  return results;
};

/**
 * Refresh the project_stats materialized view with current data.
 * Uses CONCURRENTLY to avoid blocking reads during the refresh operation.
 * @returns {Promise<void>}
 */
const refresh_project_stats = async () => {
  // Use CONCURRENTLY to avoid blocking reads while refreshing
  // This requires a unique index on the materialized view (which we have: project_stats_project_id_idx)
  await query`
    REFRESH MATERIALIZED VIEW CONCURRENTLY project_stats;
  `;
};

/**
 * Delete a project and all associated data.
 * Cascades to delete entities, relationships, and source code.
 * @param {number} id - The project ID to delete
 * @returns {Promise<void>}
 */
const delete_project = async (id) => {
  // Delete in order to respect foreign key constraints
  // First delete relationships (they reference entities)
  await query`
    DELETE FROM relationship
     WHERE caller_id IN (SELECT id FROM entity WHERE project_id = ${id})
        OR callee_id IN (SELECT id FROM entity WHERE project_id = ${id})
  `;

  // Delete entities
  await query`
    DELETE FROM entity WHERE project_id = ${id}
  `;

  // Delete source code
  await query`
    DELETE FROM sourcecode WHERE project_id = ${id}
  `;

  // Delete the project
  await query`
    DELETE FROM project WHERE id = ${id}
  `;

  // Refresh the stats view
  await refresh_project_stats();
};

export {
  insert_or_update_project,
  get_project_by_name,
  get_project_by_path,
  get_project_by_id,
  get_all_projects_with_metadata,
  refresh_project_stats,
  delete_project
};
