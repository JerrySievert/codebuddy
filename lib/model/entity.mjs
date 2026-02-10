'use strict';

/**
 * @fileoverview Entity model for database operations.
 * Handles CRUD operations for code entities (functions, classes, etc.).
 * @module lib/model/entity
 */

import { query } from '../db.mjs';

/**
 * Delete all entities for a project.
 * Used before fresh import to avoid slow ON CONFLICT checks.
 * @param {number} project_id - The project ID
 * @returns {Promise<void>}
 */
const clear_entities_for_project = async (project_id) => {
  await query`DELETE FROM entity WHERE project_id = ${project_id}`;
};

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
  const unique_map = new Map();
  for (const e of entities) {
    const key = `${e.project_id}:${e.language}:${e.symbol}:${e.type}:${e.filename}`;
    unique_map.set(key, e);
  }
  const deduped_entities = Array.from(unique_map.values());

  // Build arrays for each column
  const project_ids = deduped_entities.map((e) => e.project_id);
  const languages = deduped_entities.map((e) => e.language);
  const symbols = deduped_entities.map((e) => e.symbol);
  const types = deduped_entities.map((e) => e.type);
  const filenames = deduped_entities.map((e) => e.filename);
  const sources = deduped_entities.map((e) =>
    e.source === undefined ? null : e.source
  );
  const start_lines = deduped_entities.map((e) => e.start_line);
  const end_lines = deduped_entities.map((e) => e.end_line);
  const parameters = deduped_entities.map((e) =>
    e.parameters === undefined ? null : e.parameters
  );
  const comments = deduped_entities.map((e) =>
    e.comment === undefined ? null : e.comment
  );
  const return_types = deduped_entities.map((e) => e.return_type);

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
 * Returns a lightweight view with symbol, filename, parameters, start_line, and type.
 * @param {Object} params - Query parameters
 * @param {number} params.project_id - The project ID (required)
 * @param {string} [params.filename] - Filter by filename
 * @param {string} [params.type] - Filter by entity type
 * @returns {Promise<Object[]>} Array of symbol records
 */
const get_entity_symbols = async ({ project_id, filename, type }) => {
  return await query`
    SELECT id,
           symbol,
           filename,
           parameters,
           start_line,
           type,
           language
      FROM entity
     WHERE project_id = ${project_id}
       ${filename !== undefined ? query`AND filename = ${filename}` : query``}
       ${type !== undefined ? query`AND type = ${type}` : query``}
     ORDER BY type ASC, symbol ASC
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
 * Get members (functions) that belong to a class or struct.
 * Finds functions whose line range is within the class/struct line range.
 * @param {Object} params - Query parameters
 * @param {number} params.project_id - The project ID
 * @param {string} params.filename - The filename containing the class
 * @param {number} params.start_line - Start line of the class/struct
 * @param {number} params.end_line - End line of the class/struct
 * @returns {Promise<Object[]>} Array of member function records
 */
const get_class_members = async ({
  project_id,
  filename,
  start_line,
  end_line
}) => {
  return await query`
    SELECT id,
           symbol,
           filename,
           parameters,
           start_line,
           end_line,
           type,
           return_type
      FROM entity
     WHERE project_id = ${project_id}
       AND filename = ${filename}
       AND type = 'function'
       AND start_line > ${start_line}
       AND end_line < ${end_line}
     ORDER BY start_line ASC
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
     ORDER BY (symbol ilike ${symbol.replace(/[_%]/g, '\\$&') + '%'}) DESC,
              lower(symbol) ASC
     LIMIT ${limit}
    `;
};

/**
 * Update inheritance-related columns for an entity.
 * @param {Object} params - Update parameters
 * @param {number} params.id - Entity ID to update
 * @param {string} [params.parent_class] - Parent class name
 * @param {string[]} [params.interfaces] - Array of implemented interface names
 * @param {boolean} [params.is_abstract] - Whether the class is abstract
 * @returns {Promise<Object[]>} Updated entity record
 */
const update_entity_inheritance = async ({
  id,
  parent_class,
  interfaces,
  is_abstract
}) => {
  return await query`
    UPDATE entity
       SET parent_class = ${parent_class || null},
           interfaces = ${interfaces || null},
           is_abstract = ${is_abstract || false},
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ${id}
     RETURNING *
  `;
};

/**
 * Batch update inheritance-related columns for multiple entities.
 * Much faster than individual updates for large imports.
 * @param {Object[]} updates - Array of update objects
 * @param {number} updates[].id - Entity ID to update
 * @param {string} [updates[].parent_class] - Parent class name
 * @param {string[]} [updates[].interfaces] - Array of implemented interface names
 * @param {boolean} [updates[].is_abstract] - Whether the class is abstract
 * @returns {Promise<void>}
 */
const batch_update_entity_inheritance = async (updates) => {
  if (updates.length === 0) return;

  const ids = updates.map((u) => u.id);
  const parent_classes = updates.map((u) => u.parent_class || null);
  // Convert interfaces arrays to PostgreSQL array literal format
  // Each element must be a string like '{Interface1,Interface2}' or null
  const interfaces_arr = updates.map((u) => {
    if (!u.interfaces || u.interfaces.length === 0) return null;
    // Format as PostgreSQL array literal: {elem1,elem2,...}
    const escaped = u.interfaces.map((i) => `"${i.replace(/"/g, '\\"')}"`);
    return `{${escaped.join(',')}}`;
  });
  const is_abstracts = updates.map((u) => (u.is_abstract ? 't' : 'f'));

  await query`
    UPDATE entity e
       SET parent_class = u.parent_class,
           interfaces = u.interfaces::text[],
           is_abstract = u.is_abstract::boolean,
           updated_at = CURRENT_TIMESTAMP
      FROM (
        SELECT * FROM UNNEST(
          ${ids}::int[],
          ${parent_classes}::text[],
          ${interfaces_arr}::text[],
          ${is_abstracts}::text[]
        ) AS t(id, parent_class, interfaces, is_abstract)
      ) AS u
     WHERE e.id = u.id
  `;
};

/**
 * Get entities that are classes or structs for a project.
 * @param {Object} params - Query parameters
 * @param {number} params.project_id - The project ID
 * @returns {Promise<Object[]>} Array of class/struct entity records
 */
const get_class_entities = async ({ project_id }) => {
  return await query`
    SELECT *
      FROM entity
     WHERE project_id = ${project_id}
       AND type IN ('class', 'struct')
     ORDER BY filename, start_line
  `;
};

/**
 * Batch lookup entities by symbols and type using a single query with IN clause.
 * Much faster than individual get_entity calls for relationship building.
 * NOTE: This intentionally searches across ALL projects to support cross-project
 * relationships (e.g., pljs calling postgres's palloc).
 * @param {string[]} symbols - Array of symbol names to look up
 * @param {string} type - Entity type to filter by (e.g., 'function')
 * @returns {Promise<Map<string, Object>>} Map of symbol -> first matching entity
 */
const batch_get_entities_by_symbols = async (symbols, type) => {
  if (symbols.length === 0) return new Map();

  // Deduplicate symbols
  const unique_symbols = [...new Set(symbols)];

  const results = await query`
    SELECT DISTINCT ON (symbol) *
      FROM entity
     WHERE symbol = ANY(${unique_symbols})
       AND type = ${type}
     ORDER BY symbol, id
  `;

  const map = new Map();
  for (const entity of results) {
    map.set(entity.symbol, entity);
  }
  return map;
};

/**
 * Threshold for creating a partial index on a project.
 * Projects with more entities than this will get a dedicated partial index
 * for faster queries on the /api/v1/functions endpoint.
 */
const PARTIAL_INDEX_THRESHOLD = 10000;

/**
 * Create a partial index for a large project to speed up entity queries.
 * The index covers (type, symbol) for entities in this specific project,
 * making ORDER BY type, symbol queries much faster.
 * @param {number} project_id - The project ID
 * @returns {Promise<boolean>} True if index was created, false if not needed
 */
const create_partial_index_for_project = async (project_id) => {
  // Check entity count for this project
  const result = await query`
    SELECT COUNT(*) as count FROM entity WHERE project_id = ${project_id}
  `;
  const count = parseInt(result[0].count, 10);

  if (count < PARTIAL_INDEX_THRESHOLD) {
    return false;
  }

  const index_name = `idx_entity_project_${project_id}_type_symbol`;

  // Check if index already exists
  const existing = await query`
    SELECT 1 FROM pg_indexes
    WHERE indexname = ${index_name}
  `;

  if (existing.length > 0) {
    return false; // Already exists
  }

  // Create partial index for this project
  // Using raw SQL since we need dynamic index name and WHERE clause
  console.log(
    `Creating partial index for project ${project_id} (${count} entities)...`
  );
  await query.unsafe(`
    CREATE INDEX CONCURRENTLY ${index_name}
    ON entity (type, symbol)
    WHERE project_id = ${project_id}
  `);
  console.log(`Partial index ${index_name} created`);

  return true;
};

export {
  insert_or_update_entity,
  batch_insert_or_update_entities,
  clear_entities_for_project,
  entity_search,
  get_entity,
  get_entity_by_id,
  get_entity_symbols,
  get_function_counts,
  get_class_members,
  update_entity_inheritance,
  batch_update_entity_inheritance,
  get_class_entities,
  batch_get_entities_by_symbols,
  create_partial_index_for_project,
  PARTIAL_INDEX_THRESHOLD
};
