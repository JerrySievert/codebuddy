'use strict';

import { query } from '../db.mjs';

const insert_or_update_project = async (project) => {
  try {
    const ret = await query`
    INSERT INTO project (
      path,
      name,
      created_at
    ) VALUES (
      ${project.path},
      ${project.name},
      CURRENT_TIMESTAMP
    ) ON CONFLICT (name) DO UPDATE SET
      updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    return ret;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const get_project_by_name = async ({ name }) => {
  return await query`
    SELECT *
      FROM project
     WHERE name = ${name}
     ORDER BY name, path
    `;
};

const get_project_by_path = async ({ path }) => {
  return await query`
    SELECT *
      FROM project
     WHERE path = ${path}
     ORDER BY name, path
    `;
};

const get_project_by_id = async (id) => {
  const projects = await query`
    SELECT *
      FROM project
     WHERE id = ${id}
    `;

  return projects[0];
};

const get_all_projects_with_metadata = async () => {
  const results = await query`
    SELECT *
      FROM project_stats
    `;

  return results;
};

const refresh_project_stats = async () => {
  await query`
    REFRESH MATERIALIZED VIEW project_stats;
  `;
};

export {
  insert_or_update_project,
  get_project_by_name,
  get_project_by_path,
  get_project_by_id,
  get_all_projects_with_metadata,
  refresh_project_stats
};
