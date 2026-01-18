'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
// Add index on (type, symbol) to speed up relationship lookups during import.
// Type comes first because it has low cardinality (function, class, struct, etc.)
// which allows PostgreSQL to quickly filter down to a smaller set before
// matching on symbol. This is critical for performance - without this index,
// each lookup during create_relationships_for_entities does a full table scan.
const up = async () => {
  await query`
    CREATE INDEX idx_entity_type_symbol
      ON entity(type, symbol)
  `;
};

// Revert the migration.
const down = async () => {
  await query`
    DROP INDEX idx_entity_type_symbol
  `;
};

export { down, up };
