'use strict';

/**
 * @fileoverview Migration to create symbol_reference table.
 * Stores all identifier occurrences for cross-reference browser functionality.
 * @module migrations/1769000000000-table_symbol_reference
 */

const up = async (query) => {
  await query`
    CREATE TABLE symbol_reference (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      symbol_type TEXT NOT NULL,
      definition_entity_id INT REFERENCES entity(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      line INT NOT NULL,
      column_start INT,
      column_end INT,
      context TEXT,
      is_definition BOOLEAN DEFAULT FALSE,
      is_write BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await query`CREATE INDEX idx_symbol_reference_project_symbol ON symbol_reference(project_id, symbol)`;
  await query`CREATE INDEX idx_symbol_reference_filename ON symbol_reference(filename)`;
  await query`CREATE INDEX idx_symbol_reference_definition ON symbol_reference(definition_entity_id)`;
};

const down = async (query) => {
  await query`DROP TABLE IF EXISTS symbol_reference`;
};

export { up, down };
