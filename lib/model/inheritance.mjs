'use strict';

/**
 * @fileoverview Inheritance model for database operations.
 * Handles tracking of class inheritance and interface implementations.
 * @module lib/model/inheritance
 */

import { query } from '../db.mjs';

/**
 * Batch insert multiple inheritance relationships at once using PostgreSQL UNNEST.
 * @param {Object[]} relationships - Array of inheritance relationship objects
 * @param {number} relationships[].child_entity_id - Child entity ID
 * @param {number} [relationships[].parent_entity_id] - Parent entity ID (if resolved)
 * @param {string} relationships[].parent_symbol - Parent class/interface name
 * @param {string} relationships[].relationship_type - 'extends', 'implements', 'mixin', 'trait'
 * @returns {Promise<Object[]>} Array of inserted records
 */
const batch_insert_inheritance = async (relationships) => {
  if (relationships.length === 0) return [];

  const validRels = relationships.filter(
    (r) => r.child_entity_id != null && r.parent_symbol != null && r.relationship_type != null
  );

  if (validRels.length === 0) return [];

  const childEntityIds = validRels.map((r) => r.child_entity_id);
  const parentEntityIds = validRels.map((r) => r.parent_entity_id || null);
  const parentSymbols = validRels.map((r) => r.parent_symbol);
  const relationshipTypes = validRels.map((r) => r.relationship_type);

  return await query`
    INSERT INTO inheritance (child_entity_id, parent_entity_id, parent_symbol, relationship_type)
    SELECT * FROM UNNEST(
      ${childEntityIds}::int[],
      ${parentEntityIds}::int[],
      ${parentSymbols}::text[],
      ${relationshipTypes}::text[]
    )
  `;
};

/**
 * Get all inheritance relationships for a child entity.
 * @param {number} child_entity_id - Child entity ID
 * @returns {Promise<Object[]>} Array of inheritance records with parent info
 */
const get_parents = async (child_entity_id) => {
  return await query`
    SELECT
      i.id,
      i.child_entity_id,
      i.parent_entity_id,
      i.parent_symbol,
      i.relationship_type,
      i.created_at,
      pe.symbol AS parent_entity_symbol,
      pe.type AS parent_entity_type,
      pe.filename AS parent_filename,
      pe.start_line AS parent_start_line
    FROM inheritance i
    LEFT JOIN entity pe ON i.parent_entity_id = pe.id
    WHERE i.child_entity_id = ${child_entity_id}
    ORDER BY i.relationship_type, i.parent_symbol
  `;
};

/**
 * Get all inheritance relationships for a parent entity (find children/implementations).
 * @param {number} parent_entity_id - Parent entity ID
 * @returns {Promise<Object[]>} Array of inheritance records with child info
 */
const get_children = async (parent_entity_id) => {
  return await query`
    SELECT
      i.id,
      i.child_entity_id,
      i.parent_entity_id,
      i.parent_symbol,
      i.relationship_type,
      i.created_at,
      ce.symbol AS child_symbol,
      ce.type AS child_type,
      ce.filename AS child_filename,
      ce.start_line AS child_start_line
    FROM inheritance i
    JOIN entity ce ON i.child_entity_id = ce.id
    WHERE i.parent_entity_id = ${parent_entity_id}
    ORDER BY ce.symbol
  `;
};

/**
 * Get all children/implementations by parent symbol name (for unresolved parents).
 * @param {Object} params - Query parameters
 * @param {number} params.project_id - Project ID
 * @param {string} params.parent_symbol - Parent symbol name
 * @returns {Promise<Object[]>} Array of inheritance records with child info
 */
const get_children_by_symbol = async ({ project_id, parent_symbol }) => {
  return await query`
    SELECT
      i.id,
      i.child_entity_id,
      i.parent_entity_id,
      i.parent_symbol,
      i.relationship_type,
      i.created_at,
      ce.symbol AS child_symbol,
      ce.type AS child_type,
      ce.filename AS child_filename,
      ce.start_line AS child_start_line
    FROM inheritance i
    JOIN entity ce ON i.child_entity_id = ce.id
    WHERE ce.project_id = ${project_id}
    AND i.parent_symbol = ${parent_symbol}
    ORDER BY ce.symbol
  `;
};

/**
 * Get the full class hierarchy for a project.
 * @param {number} project_id - Project ID
 * @returns {Promise<Object[]>} Array of all inheritance relationships in the project
 */
const get_project_hierarchy = async (project_id) => {
  return await query`
    SELECT
      i.id,
      i.child_entity_id,
      i.parent_entity_id,
      i.parent_symbol,
      i.relationship_type,
      ce.symbol AS child_symbol,
      ce.type AS child_type,
      ce.filename AS child_filename,
      ce.start_line AS child_start_line,
      pe.symbol AS parent_entity_symbol,
      pe.type AS parent_entity_type,
      pe.filename AS parent_filename,
      pe.start_line AS parent_start_line
    FROM inheritance i
    JOIN entity ce ON i.child_entity_id = ce.id
    LEFT JOIN entity pe ON i.parent_entity_id = pe.id
    WHERE ce.project_id = ${project_id}
    ORDER BY ce.symbol, i.relationship_type
  `;
};

/**
 * Get inheritance statistics for a project.
 * @param {number} project_id - Project ID
 * @returns {Promise<Object>} Statistics about inheritance in the project
 */
const get_inheritance_stats = async (project_id) => {
  const stats = await query`
    SELECT
      i.relationship_type,
      COUNT(*) AS count
    FROM inheritance i
    JOIN entity ce ON i.child_entity_id = ce.id
    WHERE ce.project_id = ${project_id}
    GROUP BY i.relationship_type
    ORDER BY count DESC
  `;

  const rootClasses = await query`
    SELECT COUNT(*) AS count
    FROM entity e
    WHERE e.project_id = ${project_id}
    AND e.type IN ('class', 'struct')
    AND e.id NOT IN (
      SELECT child_entity_id FROM inheritance
    )
  `;

  const deepestHierarchy = await query`
    WITH RECURSIVE hierarchy AS (
      -- Base case: classes with no children
      SELECT
        e.id,
        e.symbol,
        1 AS depth
      FROM entity e
      WHERE e.project_id = ${project_id}
      AND e.type IN ('class', 'struct')
      AND e.id NOT IN (SELECT parent_entity_id FROM inheritance WHERE parent_entity_id IS NOT NULL)

      UNION ALL

      -- Recursive case: walk up the hierarchy
      SELECT
        i.parent_entity_id,
        pe.symbol,
        h.depth + 1
      FROM hierarchy h
      JOIN inheritance i ON i.child_entity_id = h.id
      JOIN entity pe ON i.parent_entity_id = pe.id
      WHERE i.parent_entity_id IS NOT NULL
    )
    SELECT MAX(depth) AS max_depth FROM hierarchy
  `;

  return {
    by_type: stats,
    root_class_count: parseInt(rootClasses[0]?.count || 0),
    max_hierarchy_depth: parseInt(deepestHierarchy[0]?.max_depth || 0)
  };
};

/**
 * Clear all inheritance relationships for a project.
 * @param {Object} project - The project object
 * @param {number} project.id - The project ID
 * @returns {Promise<void>}
 */
const clear_inheritance_for_project = async (project) => {
  await query`
    DELETE FROM inheritance
    WHERE child_entity_id IN (
      SELECT id FROM entity WHERE project_id = ${project.id}
    )
  `;
};

/**
 * Resolve unlinked parent references after all entities are inserted.
 * Links inheritance records to their parent entities.
 * @param {number} project_id - Project ID
 * @returns {Promise<number>} Number of records updated
 */
const resolve_parent_references = async (project_id) => {
  const result = await query`
    UPDATE inheritance i
    SET parent_entity_id = e.id
    FROM entity e
    WHERE i.parent_entity_id IS NULL
    AND i.parent_symbol = e.symbol
    AND e.project_id = ${project_id}
    AND e.type IN ('class', 'struct', 'interface', 'trait')
    AND i.child_entity_id IN (
      SELECT id FROM entity WHERE project_id = ${project_id}
    )
  `;
  return result.count || 0;
};

export {
  batch_insert_inheritance,
  get_parents,
  get_children,
  get_children_by_symbol,
  get_project_hierarchy,
  get_inheritance_stats,
  clear_inheritance_for_project,
  resolve_parent_references
};
