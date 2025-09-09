'use strict';

import { query } from '../db.mjs';
import { get_entity, get_entity_by_id } from './entity.mjs';

const insert_relationship = async (relationship) => {
  return await query`
    INSERT INTO relationship (
      caller,
      callee,
      line,
      comment
    ) VALUES (
      ${relationship.caller},
      ${relationship.callee},
      ${relationship.line},
      ${relationship.comment ? relationship.comment : null}
    )
    `;
};

const get_entities_by_caller_id = async ({ symbol, project_id }) => {
  const node = {};

  const entities = await query`
    SELECT
      c.filename               AS caller_filename,
      r.comment                AS relationship_comment,
      r.line                   AS relationship_line,

      e.id                     AS callee_id,
      e.project_id             AS callee_project_id,
      e.language               AS callee_language,
      e.symbol                 AS callee_symbol,
      e.type                   AS callee_type,
      e.filename               AS callee_filename,
      e.source                 AS callee_source,
      e.start_line             AS callee_start_line,
      e.end_line               AS callee_end_line,
      e.parameters             AS callee_parameters,
      e.comment                AS callee_comment,
      e.return_type            AS callee_return_type,
      e.created_at             AS callee_created_at,
      e.updated_at             AS callee_updated_at

    FROM relationship r
    JOIN entity c ON r.caller = c.id
    JOIN entity e ON r.callee = e.id
    WHERE c.symbol = ${symbol}
    ${project_id !== undefined ? query`AND e.project_id = ${project_id}` : query``}
  `;

  return entities;
};

const get_entities_by_callee_id = async ({ symbol, project_id }) => {
  const node = {};

  const entities = await query`
    SELECT
      c.filename               AS callee_filename,
      c.start_line             AS callee_start_line,
      r.comment                AS relationship_comment,
      r.line                   AS relationship_line,

      e.id                     AS caller_id,
      e.project_id             AS caller_project_id,
      e.language               AS caller_language,
      e.symbol                 AS caller_symbol,
      e.type                   AS caller_type,
      e.filename               AS caller_filename,
      e.source                 AS caller_source,
      e.start_line             AS caller_start_line,
      e.end_line               AS caller_end_line,
      e.parameters             AS caller_parameters,
      e.comment                AS caller_comment,
      e.return_type            AS caller_return_type,
      e.created_at             AS caller_created_at,
      e.updated_at             AS caller_updated_at

    FROM relationship r
    JOIN entity c ON r.callee = c.id
    JOIN entity e ON r.caller = e.id
    WHERE c.symbol = ${symbol}
    ${project_id !== undefined ? query`AND e.project_id = ${project_id}` : query``}
  `;

  return entities;
};

const clear_relationships_for_project = async (project) => {
  await query`
    DELETE FROM relationship WHERE caller IN (
      SELECT id FROM entity WHERE project_id = ${project.id}
    )`;
};

const build_call_tree = async (entity, visited = {}) => {
  if (visited[entity.id]) {
    return { children: [], node: entity, loop: true };
  }

  visited[entity.id] = true;

  const called_entities = await get_entities_by_caller_id(entity.id);

  const graph = { children: [], node: entity };
  for (const called_entity of called_entities) {
    graph.children.push(await build_call_tree(called_entity, visited));
  }

  return graph;
};

const call_graph_from_entity = async ({ project, entity }, visited = {}) => {
  if (visited[entity.id]) {
    return { children: [], node: entity, loop: true };
  }
  visited[entity.id] = true;

  const called_entities = await get_entities_by_caller_id(entity.id);

  const graph = { children: [], node: entity };
  for (const { called_entity } of called_entities) {
    graph.children.push(
      await graph_from_project_and_symbol({ project, symbol })
    );
  }

  return graph;
};

export {
  build_call_tree,
  insert_relationship,
  clear_relationships_for_project,
  call_graph_from_entity,
  get_entities_by_caller_id,
  get_entities_by_callee_id
};
