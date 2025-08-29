'use strict';

import { query } from '../db.mjs';

const insert_or_update_entity = async (entity) => {
  try {
    const ret = await query`
    INSERT INTO entity (
      project_id,
      language,
      symbol,
      type,
      filename,
      source,
      start_line,
      end_line,
      parameters,
      comment,
      return_type,
      created_at
    ) VALUES (
      ${entity.project_id},
      ${entity.language},
      ${entity.symbol},
      ${entity.type},
      ${entity.filename},
      ${entity.source === undefined ? null : entity.source},
      ${entity.start_line},
      ${entity.end_line},
      ${entity.parameters === undefined ? null : entity.parameters},
      ${entity.comment === undefined ? null : entity.comment},
      ${entity.return_type},
      CURRENT_TIMESTAMP
    ) ON CONFLICT (project_id, language, symbol, type) DO UPDATE SET
      filename = ${entity.filename},
      source = ${entity.source === undefined ? null : entity.source},
      start_line = ${entity.start_line},
      end_line = ${entity.end_line},
      parameters = ${entity.parameters === undefined ? null : entity.parameters},
      comment = ${entity.comment === undefined ? null : entity.comment},
      return_type = ${entity.return_type},
      updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    return ret;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const get_entity = async ({ project_id, symbol, type, filename }) => {
  return await query`
    SELECT *
      FROM entity
     WHERE symbol = ${symbol}
       ${type !== undefined ? query`AND type = ${type}` : query``}
       ${filename !== undefined ? query`AND filename = ${filename}` : query``}
       ${project_id !== undefined ? query`AND project_id = ${project_id}` : query``}
     ORDER BY project_id, symbol
    `;
};

const get_entity_by_id = async (id) => {
  const entities = await query`
    SELECT *
      FROM entity
     WHERE id = ${id}
    `;

  return entities[0];
};

const get_entity_symbols = async ({ project_id, filename, type }) => {
  return await query`
    SELECT symbol
      FROM entity
     WHERE project_id = ${project_id}
       ${filename !== undefined ? query`AND filename = ${filename}` : query``}
       ${type !== undefined ? query`AND type = ${type}` : query``}
     ORDER BY symbol ASC
    `;
};

const get_function_counts = async ({ project_id, filename }) => {
  return await query`
    SELECT filename,
           COUNT(id) AS function_count
      FROM entity
     WHERE type = 'function'
       ${filename !== undefined ? query`AND filename = ${filename}` : query``}
       ${project_id !== undefined ? query`AND project_id = ${project_id}` : query``}
     GROUP BY filename
     ORDER BY filename ASC
    `;
};

export {
  insert_or_update_entity,
  get_entity,
  get_entity_by_id,
  get_entity_symbols,
  get_function_counts
};
