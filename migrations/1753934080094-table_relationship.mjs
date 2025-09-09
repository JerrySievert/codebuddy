'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE TABLE relationship (
      id SERIAL PRIMARY KEY,
      caller INT NOT NULL REFERENCES entity(id),
      callee INT NOT NULL REFERENCES entity(id),
      line INT NOT NULL,
      comment TEXT
    )`;
};

// Revert the migration.
const down = async () => {
  await query`
   DROP TABLE relationship
`;
};

export { down, up };
