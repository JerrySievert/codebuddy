'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE MATERIALIZED VIEW project_stats AS
      SELECT p.id AS project_id,
             p.name AS name,
             p.path AS path,
             p.created_at AS created_at,
             p.updated_at AS updated_at,
             COUNT(DISTINCT e.id) AS entity_count,
             COUNT(DISTINCT s.id) AS source_count
        FROM project p
        LEFT JOIN entity e ON p.id = e.project_id
        LEFT JOIN sourcecode s ON p.id = s.project_id
       GROUP BY p.id, p.name, p.path, p.created_at, p.updated_at
  `;
};

// Revert the migration.
const down = async () => {
  await query`
    DROP MATERIALIZED VIEW project_stats
  `;
};

export { down, up };
