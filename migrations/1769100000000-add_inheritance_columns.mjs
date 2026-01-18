'use strict';

/**
 * @fileoverview Adds inheritance-related columns to the entity table.
 * @module migrations/1769100000000-add_inheritance_columns
 */

import { query } from '../lib/db.mjs';

const up = async () => {
  // Add parent_class column to track direct inheritance
  await query`ALTER TABLE entity ADD COLUMN IF NOT EXISTS parent_class TEXT`;

  // Add interfaces column to track implemented interfaces (stored as array)
  await query`ALTER TABLE entity ADD COLUMN IF NOT EXISTS interfaces TEXT[]`;

  // Add is_abstract column to track abstract classes
  await query`ALTER TABLE entity ADD COLUMN IF NOT EXISTS is_abstract BOOLEAN DEFAULT FALSE`;
};

const down = async () => {
  await query`ALTER TABLE entity DROP COLUMN IF EXISTS is_abstract`;
  await query`ALTER TABLE entity DROP COLUMN IF EXISTS interfaces`;
  await query`ALTER TABLE entity DROP COLUMN IF EXISTS parent_class`;
};

export { up, down };
