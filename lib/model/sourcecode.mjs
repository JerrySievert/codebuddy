'use strict';

/**
 * @fileoverview Sourcecode model for database operations.
 * Handles storage and retrieval of source file contents.
 * @module lib/model/sourcecode
 */

import { query } from '../db.mjs';

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

export { insert_or_update_sourcecode, get_sourcecode };
