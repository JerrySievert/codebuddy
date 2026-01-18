'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
// This index optimizes the GET /api/v1/functions?project=X query which
// orders by type ASC, symbol ASC. Without this index, PostgreSQL may
// choose the wrong index and do an expensive filter + sort.
const up = async () => {
  await query`
    CREATE INDEX CONCURRENTLY idx_entity_project_type_symbol
      ON entity(project_id, type, symbol)
  `;
};

// Revert the migration.
const down = async () => {
  await query`
    DROP INDEX idx_entity_project_type_symbol
  `;
};

export { down, up };
