'use strict';

/**
 * @fileoverview Creates the inheritance table for tracking class relationships.
 * @module migrations/1769100000001-table_inheritance
 */

import { query } from '../lib/db.mjs';

const up = async () => {
  await query`
    CREATE TABLE IF NOT EXISTS inheritance (
      id SERIAL PRIMARY KEY,
      child_entity_id INT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
      parent_entity_id INT REFERENCES entity(id) ON DELETE SET NULL,
      parent_symbol TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await query`CREATE INDEX IF NOT EXISTS idx_inheritance_child ON inheritance(child_entity_id)`;
  await query`CREATE INDEX IF NOT EXISTS idx_inheritance_parent ON inheritance(parent_entity_id)`;
  await query`CREATE INDEX IF NOT EXISTS idx_inheritance_parent_symbol ON inheritance(parent_symbol)`;
};

const down = async () => {
  await query`DROP INDEX IF EXISTS idx_inheritance_parent_symbol`;
  await query`DROP INDEX IF EXISTS idx_inheritance_parent`;
  await query`DROP INDEX IF EXISTS idx_inheritance_child`;
  await query`DROP TABLE IF EXISTS inheritance`;
};

export { up, down };
