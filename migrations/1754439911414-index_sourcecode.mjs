'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE UNIQUE INDEX idx_sourcecode_project_id_filename_unique
      ON sourcecode(project_id, filename)
  `;
};

// Revert the migration.
const down = async () => {
  await query`
    DROP INDEX idx_sourcecode_project_id_filename_unique
  `;
};

export { down, up };
