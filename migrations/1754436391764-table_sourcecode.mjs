'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE TABLE sourcecode (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES project(id),
      filename TEXT,
      source TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`;
};

// Revert the migration.
const down = async () => {
  await query`DROP TABLE sourcecode`;
};

export { down, up };
