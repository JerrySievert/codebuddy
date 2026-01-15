'use strict';

import { query } from '../lib/db.mjs';

const up = async () => {
  await query`
    CREATE TABLE reference (
      id SERIAL PRIMARY KEY,
      entity_id INT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      line INT NOT NULL,
      reference_type TEXT NOT NULL,
      context TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await query`CREATE INDEX idx_reference_entity_id ON reference(entity_id)`;
  await query`CREATE INDEX idx_reference_filename ON reference(filename)`;
};

const down = async () => {
  await query`DROP TABLE IF EXISTS reference CASCADE`;
};

export { up, down };
