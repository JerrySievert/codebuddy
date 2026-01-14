'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
};

// Revert the migration.
const down = async () => {
  await query`DROP EXTENSION IF EXISTS pg_trgm`;
};

export { down, up };
