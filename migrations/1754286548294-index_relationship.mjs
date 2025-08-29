'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE INDEX idx_relationship_caller
      ON relationship(caller) INCLUDE (callee)
  `;

  await query`
    CREATE INDEX idx_relationship_callee
      ON relationship(callee) INCLUDE (caller)
  `;
};

// Revert the migration.
const down = async () => {
  await query`
    DROP INDEX idx_relationship_caller
  `;

  await query`
    DROP INDEX idx_relationship_callee
  `;
};

export { down, up };
