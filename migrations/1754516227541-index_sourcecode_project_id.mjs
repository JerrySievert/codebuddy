'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE INDEX idx_sourcecode_project_id
      ON sourcecode(project_id)
  `;
};

// Revert the migration.
const down = async () => {
  await query`
    DROP INDEX idx_sourcecode_project_id
  `;
};

export { down, up };
