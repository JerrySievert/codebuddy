'use strict';

import { query } from '../lib/db.mjs';

const up = async () => {
  // Add git_url column if it doesn't exist
  await query`ALTER TABLE project ADD COLUMN IF NOT EXISTS git_url TEXT DEFAULT NULL`;

  // Drop and recreate the materialized view to include git_url
  await query`DROP MATERIALIZED VIEW IF EXISTS project_stats`;

  await query`
    CREATE MATERIALIZED VIEW project_stats AS
    SELECT
      p.id AS project_id,
      p.name,
      p.path,
      p.git_url,
      p.created_at,
      p.updated_at,
      COALESCE(e.cnt, 0) AS entity_count,
      COALESCE(s.cnt, 0) AS source_count
    FROM project p
    LEFT JOIN (SELECT project_id, COUNT(*) as cnt FROM entity GROUP BY project_id) e ON p.id = e.project_id
    LEFT JOIN (SELECT project_id, COUNT(*) as cnt FROM sourcecode GROUP BY project_id) s ON p.id = s.project_id
  `;

  // Create index for fast lookups
  await query`CREATE UNIQUE INDEX IF NOT EXISTS project_stats_project_id_idx ON project_stats(project_id)`;

  // Refresh the view
  await query`REFRESH MATERIALIZED VIEW project_stats`;
};

const down = async () => {
  // Drop the materialized view
  await query`DROP MATERIALIZED VIEW IF EXISTS project_stats`;

  // Recreate without git_url
  await query`
    CREATE MATERIALIZED VIEW project_stats AS
    SELECT
      p.id AS project_id,
      p.name,
      p.path,
      p.created_at,
      p.updated_at,
      COALESCE(e.cnt, 0) AS entity_count,
      COALESCE(s.cnt, 0) AS source_count
    FROM project p
    LEFT JOIN (SELECT project_id, COUNT(*) as cnt FROM entity GROUP BY project_id) e ON p.id = e.project_id
    LEFT JOIN (SELECT project_id, COUNT(*) as cnt FROM sourcecode GROUP BY project_id) s ON p.id = s.project_id
  `;

  await query`CREATE UNIQUE INDEX IF NOT EXISTS project_stats_project_id_idx ON project_stats(project_id)`;
  await query`REFRESH MATERIALIZED VIEW project_stats`;

  // Remove git_url column
  await query`ALTER TABLE project DROP COLUMN IF EXISTS git_url`;
};

export { up, down };
