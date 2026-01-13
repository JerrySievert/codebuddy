'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
// Fix: Include filename in the unique constraint so that functions with the
// same name in different files are stored separately.
const up = async () => {
  // Drop the old unique index
  await query`
    DROP INDEX IF EXISTS idx_entity_project_id_language_symbol_type_unique
  `;

  // Create new unique index that includes filename
  await query`
    CREATE UNIQUE INDEX idx_entity_project_id_language_symbol_type_filename_unique
      ON entity(project_id, language, symbol, type, filename)
  `;
};

// Revert the migration.
const down = async () => {
  // Drop the new index
  await query`
    DROP INDEX IF EXISTS idx_entity_project_id_language_symbol_type_filename_unique
  `;

  // Find duplicate entity IDs that will be deleted
  // (all except the MIN(id) for each project_id, language, symbol, type group)
  const duplicateIds = await query`
    SELECT id FROM entity
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM entity
      GROUP BY project_id, language, symbol, type
    )
  `;

  if (duplicateIds.length > 0) {
    const idsToDelete = duplicateIds.map((r) => r.id);

    // Delete relationships referencing these duplicate entities
    await query`
      DELETE FROM relationship
      WHERE caller = ANY(${idsToDelete}) OR callee = ANY(${idsToDelete})
    `;

    // Delete duplicate entries
    await query`
      DELETE FROM entity
      WHERE id = ANY(${idsToDelete})
    `;
  }

  // Restore the old index
  await query`
    CREATE UNIQUE INDEX idx_entity_project_id_language_symbol_type_unique
      ON entity(project_id, language, symbol, type)
  `;
};

export { down, up };
