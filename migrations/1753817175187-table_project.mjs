'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
  CREATE TABLE project (
    id SERIAL PRIMARY KEY,
    path TEXT,
    name TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`;
};

// Revert the migration.
const down = async () => {
  await query`DROP TABLE project`;
};

export { down, up };
