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

const get_entities_by_caller_id = async (caller_id) => {
  const node = {};

  const entities = await query`
    SELECT *
      FROM entity
     WHERE entity.id IN (
       SELECT callee FROM relationship WHERE caller = ${caller_id}
     )
  `;

  return entities;
};

const get_entities_by_calling_id = async (caller_id) => {
  const node = {};

  const entities = await query`
    SELECT *
      FROM entity
     WHERE entity.id IN (
       SELECT callee FROM relationship WHERE callee = ${caller_id}
     )
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
  get_entities_by_calling_id
};
