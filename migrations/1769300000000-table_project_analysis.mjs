'use strict';

import { query } from '../lib/db.mjs';

// Execute the migration.
const up = async () => {
  await query`
    CREATE TABLE project_analysis (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      analysis_type TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, analysis_type)
    )
  `;

  await query`
    CREATE INDEX idx_project_analysis_project_id ON project_analysis(project_id)
  `;
};

// Revert the migration.
const down = async () => {
  await query`DROP TABLE project_analysis`;
};

export { down, up };
