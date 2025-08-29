'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE TABLE entity (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES project(id),
      language TEXT NOT NULL,
      symbol TEXT NOT NULL,
      type TEXT,
      filename TEXT,
      source TEXT,
      start_line INTEGER,
      end_line INTEGER,
      parameters TEXT,
      comment TEXT,
      return_type TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`;
};

// Revert the migration.
const down = async () => {
  await query`
   DROP TABLE entity
`;
};

export { down, up };
