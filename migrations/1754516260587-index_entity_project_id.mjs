'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE INDEX idx_entity_project_id
      ON entity(project_id)
  `;
};

// Revert the migration.
const down = async () => {
  await query`
    DROP INDEX idx_entity_project_id
  `;
};

export { down, up };
