'use strict';

/**
 * @fileoverview Reference model for database operations.
 * Handles tracking of where structs/classes are referenced in code.
 * @module lib/model/reference
 */

import { query } from '../db.mjs';

/**
 * Batch insert multiple references at once using PostgreSQL UNNEST.
 * Filters out invalid references with null/undefined values.
 * @param {Object[]} references - Array of reference objects
 * @param {number} references[].entity_id - ID of the referenced entity (struct/class)
 * @param {string} references[].filename - File where the reference occurs
 * @param {number} references[].line - Line number of the reference
 * @param {string} references[].reference_type - Type of reference (variable, parameter, return_type, field, typedef, macro)
 * @param {string} [references[].context] - The line of code containing the reference
 * @returns {Promise<Object[]>} Array of inserted reference records
 */
const batch_insert_references = async (references) => {
  if (references.length === 0) return [];

  // Filter out any references with undefined/null required fields
  const valid_references = references.filter(
    (r) =>
      r.entity_id != null &&
      r.filename != null &&
      r.line != null &&
      r.reference_type != null
  );

  if (valid_references.length === 0) return [];

  const entity_ids = valid_references.map((r) => r.entity_id);
  const filenames = valid_references.map((r) => r.filename);
  const lines = valid_references.map((r) => r.line);
  const reference_types = valid_references.map((r) => r.reference_type);
  const contexts = valid_references.map((r) => r.context || null);

  return await query`
    INSERT INTO reference (entity_id, filename, line, reference_type, context)
    SELECT * FROM UNNEST(
      ${entity_ids}::int[],
      ${filenames}::text[],
      ${lines}::int[],
      ${reference_types}::text[],
      ${contexts}::text[]
    )
  `;
};

/**
 * Get all references for a specific entity.
 * @param {number} entity_id - The entity ID
 * @returns {Promise<Object[]>} Array of reference records
 */
const get_references_for_entity = async (entity_id) => {
  return await query`
    SELECT
      id,
      entity_id,
      filename,
      line,
      reference_type,
      context,
      created_at
    FROM reference
    WHERE entity_id = ${entity_id}
    ORDER BY filename, line
  `;
};

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
 * Get reference counts grouped by type for an entity.
 * @param {number} entity_id - The entity ID
 * @returns {Promise<Object[]>} Array of {reference_type, count}
 */
const get_reference_counts = async (entity_id) => {
  return await query`
    SELECT
      reference_type,
      COUNT(*) as count
    FROM reference
    WHERE entity_id = ${entity_id}
    GROUP BY reference_type
    ORDER BY count DESC
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

/**
 * Get all references in a project grouped by entity.
 * @param {number} project_id - The project ID
 * @returns {Promise<Object[]>} Array of entities with their reference counts
 */
const get_project_reference_summary = async (project_id) => {
  return await query`
    SELECT
      e.id,
      e.symbol,
      e.type,
      e.filename,
      e.start_line,
      COUNT(r.id) as reference_count
    FROM entity e
    LEFT JOIN reference r ON e.id = r.entity_id
    WHERE e.project_id = ${project_id}
    AND e.type IN ('struct', 'class')
    GROUP BY e.id, e.symbol, e.type, e.filename, e.start_line
    HAVING COUNT(r.id) > 0
    ORDER BY reference_count DESC
  `;
};

export {
  batch_insert_references,
  get_references_for_entity,
  get_references_by_symbol,
  get_reference_counts,
  clear_references_for_project,
  get_project_reference_summary
};
