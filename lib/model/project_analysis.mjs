'use strict';

/**
 * @fileoverview Project analysis model for database operations.
 * Handles CRUD operations for pre-calculated project analysis data.
 * @module lib/model/project_analysis
 */

import { query } from '../db.mjs';

/**
 * Insert or update analysis data for a project.
 * @param {Object} params - The analysis data
 * @param {number} params.project_id - The project ID
 * @param {string} params.analysis_type - Type of analysis (e.g., 'complexity', 'dead_code')
 * @param {Object} params.data - The analysis results as a JSON object
 * @returns {Promise<Object[]>} Array containing the inserted/updated record
 */
const upsert_project_analysis = async ({ project_id, analysis_type, data }) => {
  // Pass data directly - the postgres driver handles JSONB serialization
  return await query`
    INSERT INTO project_analysis (project_id, analysis_type, data, created_at, updated_at)
    VALUES (${project_id}, ${analysis_type}, ${data}::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (project_id, analysis_type) DO UPDATE SET
      data = ${data}::jsonb,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
};

/**
 * Parse the data field if it's a string (handles both old double-encoded and new data).
 * @param {Object} record - The database record
 * @returns {Object} Record with parsed data field
 */
const parse_data_field = (record) => {
  if (!record) return null;

  let data = record.data;
  // If data is a string, parse it (handles double-encoded JSON)
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      // If parsing fails, return as-is
    }
  }

  return { ...record, data };
};

/**
 * Get analysis data for a project by type.
 * @param {Object} params - Query parameters
 * @param {number} params.project_id - The project ID
 * @param {string} params.analysis_type - Type of analysis to retrieve
 * @returns {Promise<Object|null>} The analysis data or null if not found
 */
const get_project_analysis = async ({ project_id, analysis_type }) => {
  const results = await query`
    SELECT * FROM project_analysis
    WHERE project_id = ${project_id} AND analysis_type = ${analysis_type}
  `;
  return parse_data_field(results[0]);
};

/**
 * Get all analysis data for a project.
 * @param {number} project_id - The project ID
 * @returns {Promise<Object[]>} Array of analysis records
 */
const get_all_project_analyses = async (project_id) => {
  return await query`
    SELECT * FROM project_analysis
    WHERE project_id = ${project_id}
  `;
};

/**
 * Delete all analysis data for a project.
 * @param {number} project_id - The project ID
 * @returns {Promise<void>}
 */
const clear_project_analysis = async (project_id) => {
  await query`
    DELETE FROM project_analysis WHERE project_id = ${project_id}
  `;
};

export {
  upsert_project_analysis,
  get_project_analysis,
  get_all_project_analyses,
  clear_project_analysis
};
