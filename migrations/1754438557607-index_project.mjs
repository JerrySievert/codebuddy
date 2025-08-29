'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE UNIQUE INDEX idx_project_name_unique
      ON project(name)
  `;
};

// Revert the migration.
const down = async () => {
  await query`
    DROP INDEX idx_project_name_unique
  `;
};

export { down, up };
