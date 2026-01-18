'use strict';

/**
 * @fileoverview Symbol reference model for database operations.
 * Handles tracking of all identifier occurrences for cross-reference browser.
 * @module lib/model/symbol_reference
 */

import { query } from '../db.mjs';
import { Writable } from 'stream';

/**
 * Batch insert multiple symbol references at once using PostgreSQL UNNEST.
 * @param {Object[]} references - Array of reference objects
 * @param {number} references[].project_id - Project ID
 * @param {string} references[].symbol - Symbol name
 * @param {string} references[].symbol_type - Type (function, class, variable, etc.)
 * @param {number} [references[].definition_entity_id] - Entity ID if this is a known definition
 * @param {string} references[].filename - File where the reference occurs
 * @param {number} references[].line - Line number
 * @param {number} [references[].column_start] - Starting column
 * @param {number} [references[].column_end] - Ending column
 * @param {string} [references[].context] - The line of code containing the reference
 * @param {boolean} [references[].is_definition] - Whether this is a definition site
 * @param {boolean} [references[].is_write] - Whether this is a write/assignment
 * @returns {Promise<Object[]>} Array of inserted reference records
 */
const batch_insert_symbol_references = async (references) => {
  if (references.length === 0) return [];

  // Filter out any references with undefined/null required fields
  const valid_refs = references.filter(
    (r) =>
      r.project_id != null &&
      r.symbol != null &&
      r.filename != null &&
      r.line != null &&
      r.symbol_type != null
  );

  if (valid_refs.length === 0) return [];

  const project_ids = valid_refs.map((r) => r.project_id);
  const symbols = valid_refs.map((r) => r.symbol);
  const symbol_types = valid_refs.map((r) => r.symbol_type);
  const definition_entity_ids = valid_refs.map(
    (r) => r.definition_entity_id || null
  );
  const filenames = valid_refs.map((r) => r.filename);
  const lines = valid_refs.map((r) => r.line);
  const column_starts = valid_refs.map((r) => r.column_start || null);
  const column_ends = valid_refs.map((r) => r.column_end || null);
  const contexts = valid_refs.map((r) => r.context || null);
  // Convert booleans to strings for PostgreSQL array casting
  const is_definitions = valid_refs.map((r) => (r.is_definition ? 't' : 'f'));
  const is_writes = valid_refs.map((r) => (r.is_write ? 't' : 'f'));

  return await query`
    INSERT INTO symbol_reference (
      project_id, symbol, symbol_type, definition_entity_id,
      filename, line, column_start, column_end, context, is_definition, is_write
    )
    SELECT
      p_id, sym, sym_type, def_id, fname, ln, col_s, col_e, ctx,
      is_def::boolean, is_wr::boolean
    FROM UNNEST(
      ${project_ids}::int[],
      ${symbols}::text[],
      ${symbol_types}::text[],
      ${definition_entity_ids}::int[],
      ${filenames}::text[],
      ${lines}::int[],
      ${column_starts}::int[],
      ${column_ends}::int[],
      ${contexts}::text[],
      ${is_definitions}::text[],
      ${is_writes}::text[]
    ) AS t(p_id, sym, sym_type, def_id, fname, ln, col_s, col_e, ctx, is_def, is_wr)
  `;
};

/**
 * Get all references for a specific symbol in a project.
 * @param {Object} params - Query parameters
 * @param {number} params.project_id - Project ID
 * @param {string} params.symbol - Symbol name to find references for
 * @param {string} [params.filename] - Optional filter by filename
 * @param {boolean} [params.is_definition] - Optional filter for definitions only
 * @returns {Promise<Object[]>} Array of reference records
 */
const get_symbol_references = async ({
  project_id,
  symbol,
  filename,
  is_definition
}) => {
  return await query`
    SELECT
      sr.id,
      sr.project_id,
      sr.symbol,
      sr.symbol_type,
      sr.definition_entity_id,
      sr.filename,
      sr.line,
      sr.column_start,
      sr.column_end,
      sr.context,
      sr.is_definition,
      sr.is_write,
      sr.created_at,
      e.symbol AS definition_symbol,
      e.type AS definition_type,
      e.filename AS definition_filename,
      e.start_line AS definition_line
    FROM symbol_reference sr
    LEFT JOIN entity e ON sr.definition_entity_id = e.id
    WHERE sr.project_id = ${project_id}
    AND sr.symbol = ${symbol}
    ${filename ? query`AND sr.filename = ${filename}` : query``}
    ${is_definition !== undefined ? query`AND sr.is_definition = ${is_definition}` : query``}
    ORDER BY sr.filename, sr.line
  `;
};

/**
 * Find the definition for a symbol at a specific location.
 * Attempts to locate where a symbol is defined.
 * @param {Object} params - Query parameters
 * @param {number} params.project_id - Project ID
 * @param {string} params.symbol - Symbol name
 * @param {string} [params.filename] - File where the reference is (for context)
 * @param {number} [params.line] - Line where the reference is (for context)
 * @returns {Promise<Object|null>} Definition info or null if not found
 */
const get_definition_for_symbol = async ({
  project_id,
  symbol,
  filename,
  line
}) => {
  // First try to find a definition in the symbol_reference table
  const refs = await query`
    SELECT
      sr.id,
      sr.symbol,
      sr.symbol_type,
      sr.filename,
      sr.line,
      sr.column_start,
      sr.column_end,
      sr.context,
      sr.definition_entity_id,
      e.id AS entity_id,
      e.symbol AS entity_symbol,
      e.type AS entity_type,
      e.filename AS entity_filename,
      e.start_line AS entity_start_line,
      e.end_line AS entity_end_line,
      e.parameters AS entity_parameters,
      e.return_type AS entity_return_type,
      e.comment AS entity_comment
    FROM symbol_reference sr
    LEFT JOIN entity e ON sr.definition_entity_id = e.id
    WHERE sr.project_id = ${project_id}
    AND sr.symbol = ${symbol}
    AND sr.is_definition = true
    ORDER BY sr.filename, sr.line
    LIMIT 10
  `;

  if (refs.length > 0) {
    return refs[0];
  }

  // Fall back to entity table for functions, classes, structs
  const entities = await query`
    SELECT
      id AS entity_id,
      symbol AS entity_symbol,
      type AS entity_type,
      filename AS entity_filename,
      start_line AS entity_start_line,
      end_line AS entity_end_line,
      parameters AS entity_parameters,
      return_type AS entity_return_type,
      comment AS entity_comment
    FROM entity
    WHERE project_id = ${project_id}
    AND symbol = ${symbol}
    ORDER BY filename, start_line
    LIMIT 10
  `;

  if (entities.length > 0) {
    return entities[0];
  }

  return null;
};

/**
 * Get all definitions in a project, optionally filtered by type.
 * @param {Object} params - Query parameters
 * @param {number} params.project_id - Project ID
 * @param {string} [params.symbol_type] - Filter by symbol type
 * @returns {Promise<Object[]>} Array of definition records
 */
const get_all_definitions = async ({ project_id, symbol_type }) => {
  return await query`
    SELECT
      sr.id,
      sr.symbol,
      sr.symbol_type,
      sr.filename,
      sr.line,
      sr.context,
      sr.definition_entity_id
    FROM symbol_reference sr
    WHERE sr.project_id = ${project_id}
    AND sr.is_definition = true
    ${symbol_type ? query`AND sr.symbol_type = ${symbol_type}` : query``}
    ORDER BY sr.filename, sr.line
  `;
};

/**
 * Get reference counts grouped by symbol for a project.
 * @param {number} project_id - Project ID
 * @returns {Promise<Object[]>} Array of {symbol, symbol_type, reference_count, definition_count}
 */
const get_reference_summary = async (project_id) => {
  return await query`
    SELECT
      symbol,
      symbol_type,
      COUNT(*) AS reference_count,
      COUNT(*) FILTER (WHERE is_definition = true) AS definition_count,
      COUNT(*) FILTER (WHERE is_write = true) AS write_count
    FROM symbol_reference
    WHERE project_id = ${project_id}
    GROUP BY symbol, symbol_type
    ORDER BY reference_count DESC
    LIMIT 100
  `;
};

/**
 * Delete all symbol references for a project.
 * Used before refreshing a project to clear stale data.
 * @param {Object} project - The project object
 * @param {number} project.id - The project ID
 * @returns {Promise<void>}
 */
const clear_symbol_references_for_project = async (project) => {
  await query`DELETE FROM symbol_reference WHERE project_id = ${project.id}`;
};

/**
 * Disable indexes on symbol_reference table for faster bulk loading.
 * Call this before bulk operations, then call rebuild_symbol_reference_indexes after.
 * @returns {Promise<void>}
 */
const disable_symbol_reference_indexes = async () => {
  // Drop indexes (they will be recreated after bulk load)
  await query`DROP INDEX IF EXISTS idx_symbol_reference_project_symbol`;
  await query`DROP INDEX IF EXISTS idx_symbol_reference_filename`;
  await query`DROP INDEX IF EXISTS idx_symbol_reference_definition`;
};

/**
 * Rebuild indexes on symbol_reference table after bulk loading.
 * Indexes are created concurrently for better performance.
 * @returns {Promise<void>}
 */
const rebuild_symbol_reference_indexes = async () => {
  // Create all indexes concurrently for faster rebuilding
  await Promise.all([
    query`CREATE INDEX idx_symbol_reference_project_symbol ON symbol_reference(project_id, symbol)`,
    query`CREATE INDEX idx_symbol_reference_filename ON symbol_reference(filename)`,
    query`CREATE INDEX idx_symbol_reference_definition ON symbol_reference(definition_entity_id)`
  ]);
};

/**
 * Bulk insert symbol references using PostgreSQL COPY for maximum performance.
 * This is 10-100x faster than regular INSERT for large datasets.
 * @param {Object[]} references - Array of reference objects (same format as batch_insert)
 * @returns {Promise<number>} Number of rows inserted
 */
const bulk_copy_symbol_references = async (references) => {
  if (references.length === 0) return 0;

  // Filter valid references
  const valid_refs = references.filter(
    (r) =>
      r.project_id != null &&
      r.symbol != null &&
      r.filename != null &&
      r.line != null &&
      r.symbol_type != null
  );

  if (valid_refs.length === 0) return 0;

  // Use postgres.js copy functionality
  // Format: COPY table (columns) FROM STDIN
  const columns = [
    'project_id',
    'symbol',
    'symbol_type',
    'definition_entity_id',
    'filename',
    'line',
    'column_start',
    'column_end',
    'context',
    'is_definition',
    'is_write'
  ];

  // Build rows as tab-separated values
  const rows = valid_refs.map((r) =>
    [
      r.project_id,
      r.symbol
        .replace(/\\/g, '\\\\')
        .replace(/\t/g, '\\t')
        .replace(/\n/g, '\\n'), // Escape special chars
      r.symbol_type,
      r.definition_entity_id || '\\N', // NULL value
      r.filename
        .replace(/\\/g, '\\\\')
        .replace(/\t/g, '\\t')
        .replace(/\n/g, '\\n'),
      r.line,
      r.column_start || '\\N',
      r.column_end || '\\N',
      (r.context || '')
        .replace(/\\/g, '\\\\')
        .replace(/\t/g, '\\t')
        .replace(/\n/g, '\\n') || '\\N',
      r.is_definition ? 't' : 'f',
      r.is_write ? 't' : 'f'
    ].join('\t')
  );

  // Use the copy command with stream
  const writable =
    await query`COPY symbol_reference (${query.unsafe(columns.join(', '))}) FROM STDIN`.writable();

  return new Promise((resolve, reject) => {
    let count = 0;
    const batch_size = 10000;

    const write_next_batch = () => {
      while (count < rows.length) {
        const row = rows[count] + '\n';
        count++;
        if (!writable.write(row)) {
          // Backpressure - wait for drain
          writable.once('drain', write_next_batch);
          return;
        }
      }
      // Done writing all rows
      writable.end();
    };

    writable.on('finish', () => resolve(valid_refs.length));
    writable.on('error', reject);

    write_next_batch();
  });
};

export {
  batch_insert_symbol_references,
  bulk_copy_symbol_references,
  disable_symbol_reference_indexes,
  rebuild_symbol_reference_indexes,
  get_symbol_references,
  get_definition_for_symbol,
  get_all_definitions,
  get_reference_summary,
  clear_symbol_references_for_project
};
