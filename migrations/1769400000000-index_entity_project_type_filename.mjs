'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration - add composite index for file listing queries
const up = async () => {
  await query`
    CREATE INDEX IF NOT EXISTS idx_entity_project_type_filename
      ON entity(project_id, type, filename)
  `;
};

// Revert the migration.
const down = async () => {
  await query`
    DROP INDEX IF EXISTS idx_entity_project_type_filename
  `;
};

export { down, up };
