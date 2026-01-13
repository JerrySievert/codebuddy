'use strict';

/**
 * @fileoverview Entity model for database operations.
 * Handles CRUD operations for code entities (functions, classes, etc.).
 * @module lib/model/entity
 */

import { query } from '../db.mjs';

/**
 * Batch insert or update multiple entities at once using PostgreSQL UNNEST.
 * Deduplicates entities by unique key (project_id, language, symbol, type, filename).
 * Much faster than individual inserts for large imports.
 * @param {Object[]} entities - Array of entity objects to insert/update
 * @param {number} entities[].project_id - Project ID
 * @param {string} entities[].language - Programming language
 * @param {string} entities[].symbol - Entity symbol name
 * @param {string} entities[].type - Entity type (e.g., 'function')
 * @param {string} entities[].filename - Source filename
 * @param {string} [entities[].source] - Source code content
 * @param {number} entities[].start_line - Starting line number
 * @param {number} entities[].end_line - Ending line number
 * @param {string} [entities[].parameters] - Function parameters
 * @param {string} [entities[].comment] - Associated comment/docstring
 * @param {string} entities[].return_type - Return type
 * @returns {Promise<Object[]>} Array of inserted/updated entity records with IDs
 */
const batch_insert_or_update_entities = async (entities) => {
  if (entities.length === 0) return [];

  // Deduplicate entities by their unique key (project_id, language, symbol, type, filename)
  // Keep the last occurrence (in case of updates)
  const uniqueMap = new Map();
  for (const e of entities) {
    const key = `${e.project_id}:${e.language}:${e.symbol}:${e.type}:${e.filename}`;
    uniqueMap.set(key, e);
  }
  const dedupedEntities = Array.from(uniqueMap.values());

  // Build arrays for each column
  const project_ids = dedupedEntities.map((e) => e.project_id);
  const languages = dedupedEntities.map((e) => e.language);
  const symbols = dedupedEntities.map((e) => e.symbol);
  const types = dedupedEntities.map((e) => e.type);
  const filenames = dedupedEntities.map((e) => e.filename);
  const sources = dedupedEntities.map((e) =>
    e.source === undefined ? null : e.source
  );
  const start_lines = dedupedEntities.map((e) => e.start_line);
  const end_lines = dedupedEntities.map((e) => e.end_line);
  const parameters = dedupedEntities.map((e) =>
    e.parameters === undefined ? null : e.parameters
  );
  const comments = dedupedEntities.map((e) =>
    e.comment === undefined ? null : e.comment
  );
  const return_types = dedupedEntities.map((e) => e.return_type);

  const ret = await query`
    INSERT INTO entity (
      project_id, language, symbol, type, filename, source,
      start_line, end_line, parameters, comment, return_type, created_at
    )
    SELECT
      u.project_id, u.language, u.symbol, u.type, u.filename, u.source,
      u.start_line, u.end_line, u.parameters, u.comment, u.return_type,
      CURRENT_TIMESTAMP
    FROM UNNEST(
      ${project_ids}::int[],
      ${languages}::text[],
      ${symbols}::text[],
      ${types}::text[],
      ${filenames}::text[],
      ${sources}::text[],
      ${start_lines}::int[],
      ${end_lines}::int[],
      ${parameters}::text[],
      ${comments}::text[],
      ${return_types}::text[]
    ) AS u(project_id, language, symbol, type, filename, source, start_line, end_line, parameters, comment, return_type)
    ON CONFLICT (project_id, language, symbol, type, filename) DO UPDATE SET
      source = EXCLUDED.source,
      start_line = EXCLUDED.start_line,
      end_line = EXCLUDED.end_line,
      parameters = EXCLUDED.parameters,
      comment = EXCLUDED.comment,
      return_type = EXCLUDED.return_type,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;

  return ret;
};

/**
 * Insert a new entity or update an existing one.
 * Updates are matched by unique key (project_id, language, symbol, type, filename).
 * @param {Object} entity - The entity data
 * @param {number} entity.project_id - Project ID
 * @param {string} entity.language - Programming language
 * @param {string} entity.symbol - Entity symbol name
 * @param {string} entity.type - Entity type (e.g., 'function')
 * @param {string} entity.filename - Source filename
 * @param {string} [entity.source] - Source code content
 * @param {number} entity.start_line - Starting line number
 * @param {number} entity.end_line - Ending line number
 * @param {string} [entity.parameters] - Function parameters
 * @param {string} [entity.comment] - Associated comment/docstring
 * @param {string} entity.return_type - Return type
 * @returns {Promise<Object[]>} Array containing the inserted/updated entity record
 * @throws {Error} If database operation fails
 */
const insert_or_update_entity = async (entity) => {
  try {
    const ret = await query`
    INSERT INTO entity (
      project_id,
      language,
      symbol,
      type,
      filename,
      source,
      start_line,
      end_line,
      parameters,
      comment,
      return_type,
      created_at
    ) VALUES (
      ${entity.project_id},
      ${entity.language},
      ${entity.symbol},
      ${entity.type},
      ${entity.filename},
      ${entity.source === undefined ? null : entity.source},
      ${entity.start_line},
      ${entity.end_line},
      ${entity.parameters === undefined ? null : entity.parameters},
      ${entity.comment === undefined ? null : entity.comment},
      ${entity.return_type},
      CURRENT_TIMESTAMP
    ) ON CONFLICT (project_id, language, symbol, type, filename) DO UPDATE SET
      source = ${entity.source === undefined ? null : entity.source},
      start_line = ${entity.start_line},
      end_line = ${entity.end_line},
      parameters = ${entity.parameters === undefined ? null : entity.parameters},
      comment = ${entity.comment === undefined ? null : entity.comment},
      return_type = ${entity.return_type},
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
 * Get entities matching the given criteria.
 * All parameters are optional filters.
 * @param {Object} params - Query parameters
 * @param {number} [params.project_id] - Filter by project ID
 * @param {string} [params.symbol] - Filter by symbol name
 * @param {string} [params.type] - Filter by entity type
 * @param {string} [params.filename] - Filter by filename
 * @returns {Promise<Object[]>} Array of matching entity records
 */
const get_entity = async ({ project_id, symbol, type, filename }) => {
  return await query`
    SELECT *
      FROM entity
     WHERE 1=1
       ${symbol !== undefined ? query`AND symbol = ${symbol}` : query``}
       ${type !== undefined ? query`AND type = ${type}` : query``}
       ${filename !== undefined ? query`AND filename = ${filename}` : query``}
       ${project_id !== undefined ? query`AND project_id = ${project_id}` : query``}
     ORDER BY project_id, symbol
    `;
};

/**
 * Get an entity by its database ID.
 * @param {number} id - The entity ID
 * @returns {Promise<Object|undefined>} The entity record, or undefined if not found
 */
const get_entity_by_id = async (id) => {
  const entities = await query`
    SELECT *
      FROM entity
     WHERE id = ${id}
    `;

  return entities[0];
};

/**
 * Get entity symbols for a project, optionally filtered by filename and type.
 * Returns a lightweight view with symbol, filename, parameters, and start_line.
 * @param {Object} params - Query parameters
 * @param {number} params.project_id - The project ID (required)
 * @param {string} [params.filename] - Filter by filename
 * @param {string} [params.type] - Filter by entity type
 * @returns {Promise<Object[]>} Array of symbol records
 */
const get_entity_symbols = async ({ project_id, filename, type }) => {
  return await query`
    SELECT symbol,
           filename,
           parameters,
           start_line
      FROM entity
     WHERE project_id = ${project_id}
       ${filename !== undefined ? query`AND filename = ${filename}` : query``}
       ${type !== undefined ? query`AND type = ${type}` : query``}
     ORDER BY symbol ASC
    `;
};

/**
 * Get function counts grouped by filename.
 * @param {Object} params - Query parameters
 * @param {number} [params.project_id] - Filter by project ID
 * @param {string} [params.filename] - Filter by specific filename
 * @returns {Promise<Object[]>} Array of { filename, function_count } records
 */
const get_function_counts = async ({ project_id, filename }) => {
  return await query`
    SELECT filename,
           COUNT(id) AS function_count
      FROM entity
     WHERE type = 'function'
       ${filename !== undefined ? query`AND filename = ${filename}` : query``}
       ${project_id !== undefined ? query`AND project_id = ${project_id}` : query``}
     GROUP BY filename
     ORDER BY filename ASC
    `;
};

/**
 * Search for entities by symbol name using fuzzy matching.
 * Uses PostgreSQL similarity function for ranking results.
 * @param {Object} params - Search parameters
 * @param {string} params.symbol - Symbol pattern to search for (case-insensitive)
 * @param {number} [params.project_id] - Filter by project ID
 * @param {string} [params.filename] - Filter by filename
 * @param {string} [params.type] - Filter by entity type
 * @param {number} [params.limit=10] - Maximum number of results to return
 * @returns {Promise<Object[]>} Array of matching entities with similarity scores
 */
const entity_search = async ({
  symbol,
  project_id,
  filename,
  type,
  limit = 10
}) => {
  return await query`
    SELECT similarity(symbol, ${symbol}) AS sim,
           entity.*
      FROM entity
     WHERE symbol ilike ${'%' + symbol + '%'}
       ${project_id !== undefined ? query`AND project_id = ${project_id}` : query``}
       ${filename !== undefined ? query`AND filename = ${filename}` : query``}
       ${type !== undefined ? query`AND type = ${type}` : query``}
     ORDER BY sim DESC
     LIMIT ${limit}
    `;
};

export {
  insert_or_update_entity,
  batch_insert_or_update_entities,
  entity_search,
  get_entity,
  get_entity_by_id,
  get_entity_symbols,
  get_function_counts
};
