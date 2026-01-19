'use strict';

/**
 * @fileoverview Reference model for database operations.
 * Handles tracking of where structs/classes are referenced in code.
 * @module lib/model/reference
 */

import { query } from '../db.mjs';

/**
 * Get references for an entity by symbol name and project.
 * @param {Object} params - Query parameters
 * @param {string} params.symbol - Symbol name of the entity
 * @param {number} params.project_id - Project ID
 * @param {string} [params.reference_type] - Optional filter by reference type
 * @returns {Promise<Object[]>} Array of reference records with entity info
 */
const get_references_by_symbol = async ({
  symbol,
  project_id,
  reference_type
}) => {
  return await query`
    SELECT
      r.id,
      r.entity_id,
      r.filename,
      r.line,
      r.reference_type,
      r.context,
      r.created_at,
      e.symbol,
      e.type AS entity_type
    FROM reference r
    JOIN entity e ON r.entity_id = e.id
    WHERE e.symbol = ${symbol}
    AND e.project_id = ${project_id}
    ${reference_type ? query`AND r.reference_type = ${reference_type}` : query``}
    ORDER BY r.filename, r.line
  `;
};

/**
 * Delete all references for entities belonging to a project.
 * Used before refreshing a project to clear stale reference data.
 * @param {Object} project - The project object
 * @param {number} project.id - The project ID
 * @returns {Promise<void>}
 */
const clear_references_for_project = async (project) => {
  await query`
    DELETE FROM reference WHERE entity_id IN (
      SELECT id FROM entity WHERE project_id = ${project.id}
    )
  `;
};

export { get_references_by_symbol, clear_references_for_project };
