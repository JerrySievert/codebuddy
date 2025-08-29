'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE UNIQUE INDEX idx_entity_project_id_language_symbol_type_unique
      ON entity(project_id, language, symbol, type)
  `;
};

// Revert the migration.
const down = async () => {
  await query`
    DROP INDEX idx_entity_project_id_language_symbol_type_unique
  `;
};

export { down, up };
