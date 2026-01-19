'use strict';

/**
 * @fileoverview Migration to add missing indexes on symbol_reference table.
 * These indexes are critical for fast project deletion and symbol lookups.
 * @module migrations/1769600000000-index_symbol_reference_project_id
 */

import { query } from '../lib/db.mjs';

const up = async () => {
  // Index for project_id alone - critical for DELETE WHERE project_id = X
  await query`CREATE INDEX IF NOT EXISTS idx_symbol_reference_project_id ON symbol_reference(project_id)`;

  // Composite index for project + symbol lookups (was supposed to be created in original migration)
  await query`CREATE INDEX IF NOT EXISTS idx_symbol_reference_project_symbol ON symbol_reference(project_id, symbol)`;

  // Index for filename lookups
  await query`CREATE INDEX IF NOT EXISTS idx_symbol_reference_filename ON symbol_reference(filename)`;

  // Index for definition entity lookups
  await query`CREATE INDEX IF NOT EXISTS idx_symbol_reference_definition ON symbol_reference(definition_entity_id)`;
};

const down = async () => {
  await query`DROP INDEX IF EXISTS idx_symbol_reference_project_id`;
  await query`DROP INDEX IF EXISTS idx_symbol_reference_project_symbol`;
  await query`DROP INDEX IF EXISTS idx_symbol_reference_filename`;
  await query`DROP INDEX IF EXISTS idx_symbol_reference_definition`;
};

export { up, down };
