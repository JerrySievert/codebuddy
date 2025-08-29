'use strict';

import { query } from '../db.mjs';

// TODO: change the field `path` to `filename`.
const insert_or_update_sourcecode = async (sourcecode) => {
  try {
    const ret = await query`
    INSERT INTO sourcecode (
      project_id,
      filename,
      source,
      created_at
    ) VALUES (
      ${sourcecode.project_id},
      ${sourcecode.filename},
      ${sourcecode.source},
      CURRENT_TIMESTAMP
    ) ON CONFLICT (project_id, filename) DO UPDATE SET
      source = ${sourcecode.source},
      updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    return ret;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const get_sourcecode = async ({ project_id, filename }) => {
  return await query`
    SELECT *
      FROM sourcecode
     WHERE project_id = ${project_id}
       AND filename = ${filename}
    `;
};

export { insert_or_update_sourcecode, get_sourcecode };
