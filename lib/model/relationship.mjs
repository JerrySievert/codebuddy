'use strict';

/**
 * @fileoverview Relationship model for database operations.
 * Handles caller/callee relationships between code entities and call graph construction.
 * @module lib/model/relationship
 */

import { query } from '../db.mjs';
import { get_entity, get_entity_by_id } from './entity.mjs';

/**
 * Insert a single caller/callee relationship.
 * @param {Object} relationship - The relationship data
 * @param {number} relationship.caller - ID of the calling entity
 * @param {number} relationship.callee - ID of the called entity
 * @param {number} relationship.line - Line number where the call occurs
 * @param {string} [relationship.comment] - Optional comment associated with the call
 * @returns {Promise<Object[]>} The inserted relationship record
 */
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

/**
 * Batch insert multiple relationships at once using PostgreSQL UNNEST.
 * Filters out invalid relationships with null/undefined values.
 * Much faster than individual inserts for large imports.
 * @param {Object[]} relationships - Array of relationship objects
 * @param {number} relationships[].caller - ID of the calling entity
 * @param {number} relationships[].callee - ID of the called entity
 * @param {number} relationships[].line - Line number where the call occurs
 * @param {string} [relationships[].comment] - Optional comment
 * @returns {Promise<Object[]>} Array of inserted relationship records
 */
const batch_insert_relationships = async (relationships) => {
  if (relationships.length === 0) return [];

  // Filter out any relationships with undefined/null caller or callee
  const validRelationships = relationships.filter(
    (r) => r.caller != null && r.callee != null && r.line != null
  );

  if (validRelationships.length === 0) return [];

  const callers = validRelationships.map((r) => r.caller);
  const callees = validRelationships.map((r) => r.callee);
  const lines = validRelationships.map((r) => r.line);
  const comments = validRelationships.map((r) => r.comment || null);

  return await query`
    INSERT INTO relationship (caller, callee, line, comment)
    SELECT * FROM UNNEST(
      ${callers}::int[],
      ${callees}::int[],
      ${lines}::int[],
      ${comments}::text[]
    )
  `;
};

/**
 * Get all entities called by a given function (callees).
 * Returns callee details with relationship metadata.
 * @param {Object} params - Query parameters
 * @param {string} params.symbol - Symbol name of the caller function
 * @param {number} [params.project_id] - Filter by project ID
 * @returns {Promise<Object[]>} Array of callee entities with relationship info
 */
const get_entities_by_caller_id = async ({ symbol, project_id }) => {
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
      --e.source                 AS callee_source,
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
    ${project_id !== undefined ? query`AND c.project_id = ${project_id}` : query``}
  `;

  return entities;
};

/**
 * Get all entities that call a given function (callers).
 * Returns caller details with relationship metadata.
 * @param {Object} params - Query parameters
 * @param {string} params.symbol - Symbol name of the callee function
 * @param {number} [params.project_id] - Filter by project ID
 * @returns {Promise<Object[]>} Array of caller entities with relationship info
 */
const get_entities_by_callee_id = async ({ symbol, project_id }) => {
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
      --e.source                 AS caller_source,
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

/**
 * Delete all relationships for entities belonging to a project.
 * Used before refreshing a project to clear stale relationship data.
 * @param {Object} project - The project object
 * @param {number} project.id - The project ID
 * @returns {Promise<void>}
 */
const clear_relationships_for_project = async (project) => {
  await query`
    DELETE FROM relationship WHERE caller IN (
      SELECT id FROM entity WHERE project_id = ${project.id}
    )`;
};

/**
 * Build a call tree starting from an entity, following callees recursively.
 * Returns a tree structure with nodes and their children (functions they call).
 * Detects loops and truncates at max_depth to prevent infinite recursion.
 * @param {Object} params - Query parameters
 * @param {string} params.symbol - Symbol name of the root function
 * @param {number} params.project_id - The project ID
 * @param {number} [params.max_depth=5] - Maximum depth to traverse
 * @param {Object} [visited={}] - Internal: tracks visited nodes to detect loops
 * @param {number} [depth=0] - Internal: current recursion depth
 * @returns {Promise<Object>} Tree node with children array
 */
const build_call_tree = async (
  { symbol, project_id, max_depth = 5 },
  visited = {},
  depth = 0
) => {
  if (depth >= max_depth) {
    return { children: [], symbol, truncated: true };
  }

  const key = `${symbol}-${project_id}`;
  if (visited[key]) {
    return { children: [], symbol, loop: true };
  }
  visited[key] = true;

  // Get the entity info
  const entities = await get_entity({ symbol, project_id, type: 'function' });
  const entity = entities[0];

  if (!entity) {
    return { children: [], symbol, notFound: true };
  }

  // Get all functions this entity calls
  const callees = await get_entities_by_caller_id({ symbol, project_id });

  const node = {
    id: entity.id,
    symbol: entity.symbol,
    filename: entity.filename,
    start_line: entity.start_line,
    end_line: entity.end_line,
    parameters: entity.parameters,
    return_type: entity.return_type,
    comment: entity.comment,
    source: entity.source,
    children: []
  };

  for (const callee of callees) {
    const child = await build_call_tree(
      { symbol: callee.callee_symbol, project_id, max_depth },
      visited,
      depth + 1
    );
    child.call_line = callee.relationship_line;
    node.children.push(child);
  }

  return node;
};

/**
 * Build a full call graph starting from an entity, including both callers and callees.
 * Returns nodes and edges suitable for graph visualization (e.g., D3.js, Cytoscape).
 * Uses recursive CTEs to efficiently fetch only relationships within max_depth.
 * @param {Object} params - Query parameters
 * @param {string} params.symbol - Symbol name of the root function
 * @param {number} params.project_id - The project ID
 * @param {string} [params.filename] - Optional filename to disambiguate same-named functions
 * @param {number} [params.max_depth=3] - Maximum depth to traverse in each direction
 * @returns {Promise<Object>} Graph data with { root, nodes, edges }
 */
const build_call_graph = async ({
  symbol,
  project_id,
  filename,
  max_depth = 3
}) => {
  // Get the root entity
  const entities = await get_entity({ symbol, project_id, type: 'function' });
  if (entities.length === 0) {
    return { nodes: [], edges: [], root: null };
  }

  // If filename is specified, find the matching entity; otherwise use the first one
  let rootEntity = entities[0];
  if (filename) {
    const match = entities.find(
      (e) => e.filename === filename || e.filename.endsWith(filename)
    );
    if (match) {
      rootEntity = match;
    }
  }

  // Use recursive CTE to get only relationships within max_depth from the root
  // This fetches callees (functions called by root and descendants)
  const calleeRelationships = await query`
    WITH RECURSIVE callee_graph AS (
      -- Base case: direct callees of the root function
      SELECT
        r.caller, r.callee, r.line, 1 as depth
      FROM relationship r
      JOIN entity c ON r.caller = c.id
      WHERE c.symbol = ${symbol} AND c.project_id = ${project_id}

      UNION

      -- Recursive case: callees of callees (up to max_depth)
      SELECT
        r.caller, r.callee, r.line, cg.depth + 1
      FROM relationship r
      JOIN callee_graph cg ON r.caller = cg.callee
      WHERE cg.depth < ${max_depth}
    )
    SELECT DISTINCT ON (cg.caller, cg.callee)
      cg.caller AS caller_id,
      cg.callee AS callee_id,
      cg.line AS relationship_line,
      c.symbol AS caller_symbol,
      c.filename AS caller_filename,
      c.start_line AS caller_start_line,
      c.end_line AS caller_end_line,
      c.parameters AS caller_parameters,
      c.return_type AS caller_return_type,
      c.comment AS caller_comment,
      c.source AS caller_source,
      e.symbol AS callee_symbol,
      e.filename AS callee_filename,
      e.start_line AS callee_start_line,
      e.end_line AS callee_end_line,
      e.parameters AS callee_parameters,
      e.return_type AS callee_return_type,
      e.comment AS callee_comment,
      e.source AS callee_source
    FROM callee_graph cg
    JOIN entity c ON cg.caller = c.id
    JOIN entity e ON cg.callee = e.id
  `;

  // Use recursive CTE to get callers (functions that call root and ancestors)
  const callerRelationships = await query`
    WITH RECURSIVE caller_graph AS (
      -- Base case: direct callers of the root function
      SELECT
        r.caller, r.callee, r.line, 1 as depth
      FROM relationship r
      JOIN entity e ON r.callee = e.id
      WHERE e.symbol = ${symbol} AND e.project_id = ${project_id}

      UNION

      -- Recursive case: callers of callers (up to max_depth)
      SELECT
        r.caller, r.callee, r.line, cg.depth + 1
      FROM relationship r
      JOIN caller_graph cg ON r.callee = cg.caller
      WHERE cg.depth < ${max_depth}
    )
    SELECT DISTINCT ON (cg.caller, cg.callee)
      cg.caller AS caller_id,
      cg.callee AS callee_id,
      cg.line AS relationship_line,
      c.symbol AS caller_symbol,
      c.filename AS caller_filename,
      c.start_line AS caller_start_line,
      c.end_line AS caller_end_line,
      c.parameters AS caller_parameters,
      c.return_type AS caller_return_type,
      c.comment AS caller_comment,
      c.source AS caller_source,
      e.symbol AS callee_symbol,
      e.filename AS callee_filename,
      e.start_line AS callee_start_line,
      e.end_line AS callee_end_line,
      e.parameters AS callee_parameters,
      e.return_type AS callee_return_type,
      e.comment AS callee_comment,
      e.source AS callee_source
    FROM caller_graph cg
    JOIN entity c ON cg.caller = c.id
    JOIN entity e ON cg.callee = e.id
  `;

  // Build graph from the fetched relationships
  const nodes = new Map();
  const edges = [];
  const edgeSet = new Set(); // To deduplicate edges

  const addNode = (entity, isRoot = false) => {
    if (!nodes.has(entity.id)) {
      nodes.set(entity.id, {
        id: entity.id,
        symbol: entity.symbol,
        filename: entity.filename,
        start_line: entity.start_line,
        end_line: entity.end_line,
        parameters: entity.parameters,
        return_type: entity.return_type,
        comment: entity.comment,
        source: entity.source,
        isRoot
      });
    }
  };

  // Add root node
  addNode(rootEntity, true);

  // Process callee relationships
  for (const rel of calleeRelationships) {
    addNode({
      id: rel.caller_id,
      symbol: rel.caller_symbol,
      filename: rel.caller_filename,
      start_line: rel.caller_start_line,
      end_line: rel.caller_end_line,
      parameters: rel.caller_parameters,
      return_type: rel.caller_return_type,
      comment: rel.caller_comment,
      source: rel.caller_source
    });

    addNode({
      id: rel.callee_id,
      symbol: rel.callee_symbol,
      filename: rel.callee_filename,
      start_line: rel.callee_start_line,
      end_line: rel.callee_end_line,
      parameters: rel.callee_parameters,
      return_type: rel.callee_return_type,
      comment: rel.callee_comment,
      source: rel.callee_source
    });

    const edgeKey = `${rel.caller_id}->${rel.callee_id}`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      edges.push({
        from: rel.caller_id,
        to: rel.callee_id,
        line: rel.relationship_line
      });
    }
  }

  // Process caller relationships
  for (const rel of callerRelationships) {
    addNode({
      id: rel.caller_id,
      symbol: rel.caller_symbol,
      filename: rel.caller_filename,
      start_line: rel.caller_start_line,
      end_line: rel.caller_end_line,
      parameters: rel.caller_parameters,
      return_type: rel.caller_return_type,
      comment: rel.caller_comment,
      source: rel.caller_source
    });

    addNode({
      id: rel.callee_id,
      symbol: rel.callee_symbol,
      filename: rel.callee_filename,
      start_line: rel.callee_start_line,
      end_line: rel.callee_end_line,
      parameters: rel.callee_parameters,
      return_type: rel.callee_return_type,
      comment: rel.callee_comment,
      source: rel.callee_source
    });

    const edgeKey = `${rel.caller_id}->${rel.callee_id}`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      edges.push({
        from: rel.caller_id,
        to: rel.callee_id,
        line: rel.relationship_line
      });
    }
  }

  return {
    root: rootEntity.id,
    nodes: Array.from(nodes.values()),
    edges
  };
};

/**
 * Build a caller tree starting from a function, following callers recursively.
 * Returns a tree structure showing functions that call this function (and their callers).
 * @param {Object} params - Query parameters
 * @param {string} params.symbol - Symbol name of the root function
 * @param {number} params.project_id - The project ID
 * @param {number} [params.depth=1] - Maximum depth to traverse (-1 for unlimited, default 1)
 * @param {Object} [visited={}] - Internal: tracks visited nodes to detect loops
 * @param {number} [currentDepth=0] - Internal: current recursion depth
 * @returns {Promise<Object>} Tree node with callers array
 */
const build_caller_tree = async (
  { symbol, project_id, depth = 1 },
  visited = {},
  currentDepth = 0
) => {
  // Check depth limit (-1 means unlimited)
  if (depth !== -1 && currentDepth >= depth) {
    return { symbol, truncated: true, callers: [] };
  }

  const key = `${symbol}-${project_id}`;
  if (visited[key]) {
    return { symbol, loop: true, callers: [] };
  }
  visited[key] = true;

  // Get the entity info
  const entities = await get_entity({ symbol, project_id, type: 'function' });
  const entity = entities[0];

  if (!entity) {
    return { symbol, notFound: true, callers: [] };
  }

  // Get all functions that call this entity
  const callers = await get_entities_by_callee_id({ symbol, project_id });

  const node = {
    id: entity.id,
    symbol: entity.symbol,
    filename: entity.filename,
    start_line: entity.start_line,
    end_line: entity.end_line,
    parameters: entity.parameters,
    return_type: entity.return_type,
    comment: entity.comment,
    callers: []
  };

  for (const caller of callers) {
    const child = await build_caller_tree(
      { symbol: caller.caller_symbol, project_id, depth },
      { ...visited },
      currentDepth + 1
    );
    child.call_line = caller.relationship_line;
    node.callers.push(child);
  }

  return node;
};

/**
 * Build a callee tree starting from a function, following callees recursively.
 * Returns a tree structure showing functions called by this function (and what they call).
 * @param {Object} params - Query parameters
 * @param {string} params.symbol - Symbol name of the root function
 * @param {number} params.project_id - The project ID
 * @param {number} [params.depth=1] - Maximum depth to traverse (-1 for unlimited, default 1)
 * @param {Object} [visited={}] - Internal: tracks visited nodes to detect loops
 * @param {number} [currentDepth=0] - Internal: current recursion depth
 * @returns {Promise<Object>} Tree node with callees array
 */
const build_callee_tree = async (
  { symbol, project_id, depth = 1 },
  visited = {},
  currentDepth = 0
) => {
  // Check depth limit (-1 means unlimited)
  if (depth !== -1 && currentDepth >= depth) {
    return { symbol, truncated: true, callees: [] };
  }

  const key = `${symbol}-${project_id}`;
  if (visited[key]) {
    return { symbol, loop: true, callees: [] };
  }
  visited[key] = true;

  // Get the entity info
  const entities = await get_entity({ symbol, project_id, type: 'function' });
  const entity = entities[0];

  if (!entity) {
    return { symbol, notFound: true, callees: [] };
  }

  // Get all functions this entity calls
  const callees = await get_entities_by_caller_id({ symbol, project_id });

  const node = {
    id: entity.id,
    symbol: entity.symbol,
    filename: entity.filename,
    start_line: entity.start_line,
    end_line: entity.end_line,
    parameters: entity.parameters,
    return_type: entity.return_type,
    comment: entity.comment,
    callees: []
  };

  for (const callee of callees) {
    const child = await build_callee_tree(
      { symbol: callee.callee_symbol, project_id, depth },
      { ...visited },
      currentDepth + 1
    );
    child.call_line = callee.relationship_line;
    node.callees.push(child);
  }

  return node;
};

export {
  build_call_tree,
  build_call_graph,
  build_caller_tree,
  build_callee_tree,
  insert_relationship,
  batch_insert_relationships,
  clear_relationships_for_project,
  get_entities_by_caller_id,
  get_entities_by_callee_id
};
