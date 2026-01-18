'use strict';

/**
 * @fileoverview Sourcecode model for database operations.
 * Handles storage and retrieval of source file contents.
 * @module lib/model/sourcecode
 */

import { query } from '../db.mjs';

/**
 * Delete all sourcecode for a project.
 * Used before fresh import to avoid slow ON CONFLICT checks.
 * @param {number} project_id - The project ID
 * @returns {Promise<void>}
 */
const clear_sourcecode_for_project = async (project_id) => {
  await query`DELETE FROM sourcecode WHERE project_id = ${project_id}`;
};

/**
 * Batch insert sourcecode without conflict handling (for fresh imports).
 * Much faster than batch_insert_or_update_sourcecode for large imports.
 * Use after clear_sourcecode_for_project for best performance.
 * @param {Object[]} sourcecodes - Array of sourcecode objects to insert
 * @returns {Promise<Object[]>} Array of inserted sourcecode records
 */
const batch_insert_sourcecode_fast = async (sourcecodes) => {
  if (sourcecodes.length === 0) return [];

  const project_ids = sourcecodes.map((s) => s.project_id);
  const filenames = sourcecodes.map((s) => s.filename);
  const sources = sourcecodes.map((s) => s.source);

  const ret = await query`
    INSERT INTO sourcecode (project_id, filename, source, created_at)
    SELECT u.project_id, u.filename, u.source, CURRENT_TIMESTAMP
    FROM UNNEST(
      ${project_ids}::int[],
      ${filenames}::text[],
      ${sources}::text[]
    ) AS u(project_id, filename, source)
  `;

  return ret;
};

/**
 * Insert or update source code for a file in a project.
 * Updates are matched by (project_id, filename) unique constraint.
 * @param {Object} sourcecode - The sourcecode data
 * @param {number} sourcecode.project_id - The project ID
 * @param {string} sourcecode.filename - The filename (relative to project root)
 * @param {string} sourcecode.source - The source code content
 * @returns {Promise<Object[]>} Array containing the inserted/updated sourcecode record
 * @throws {Error} If database operation fails
 * @todo Change the field `path` to `filename` in database schema
 */
const insert_or_update_sourcecode = async (sourcecode) => {
  try {
    const ret = await query`
    INSERT INTO sourcecode (
      project_id,
      filename,
      source,
      created_at
    ) VALUES (
      ${sourcecode.project_id},
      ${sourcecode.filename},
      ${sourcecode.source},
      CURRENT_TIMESTAMP
    ) ON CONFLICT (project_id, filename) DO UPDATE SET
      source = ${sourcecode.source},
      updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    return ret;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

/**
 * Get source code for a specific file in a project.
 * @param {Object} params - Query parameters
 * @param {number} params.project_id - The project ID
 * @param {string} params.filename - The filename to retrieve
 * @returns {Promise<Object[]>} Array of matching sourcecode records (typically 0 or 1)
 */
const get_sourcecode = async ({ project_id, filename }) => {
  return await query`
    SELECT *
      FROM sourcecode
     WHERE project_id = ${project_id}
       AND filename = ${filename}
    `;
};

/**
 * Batch insert or update multiple source files at once using PostgreSQL UNNEST.
 * Much faster than individual inserts for large imports - reduces DB round trips.
 * @param {Object[]} sourcecodes - Array of sourcecode objects to insert/update
 * @param {number} sourcecodes[].project_id - Project ID
 * @param {string} sourcecodes[].filename - The filename (relative to project root)
 * @param {string} sourcecodes[].source - The source code content
 * @returns {Promise<Object[]>} Array of inserted/updated sourcecode records
 */
const batch_insert_or_update_sourcecode = async (sourcecodes) => {
  if (sourcecodes.length === 0) return [];

  const project_ids = sourcecodes.map((s) => s.project_id);
  const filenames = sourcecodes.map((s) => s.filename);
  const sources = sourcecodes.map((s) => s.source);

  const ret = await query`
    INSERT INTO sourcecode (project_id, filename, source, created_at)
    SELECT u.project_id, u.filename, u.source, CURRENT_TIMESTAMP
    FROM UNNEST(
      ${project_ids}::int[],
      ${filenames}::text[],
      ${sources}::text[]
    ) AS u(project_id, filename, source)
    ON CONFLICT (project_id, filename) DO UPDATE SET
      source = EXCLUDED.source,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;

  return ret;
};

export {
  insert_or_update_sourcecode,
  batch_insert_or_update_sourcecode,
  batch_insert_sourcecode_fast,
  clear_sourcecode_for_project,
  get_sourcecode
};
