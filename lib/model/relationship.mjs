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
  const valid_relationships = relationships.filter(
    (r) => r.caller != null && r.callee != null && r.line != null
  );

  if (valid_relationships.length === 0) return [];

  const callers = valid_relationships.map((r) => r.caller);
  const callees = valid_relationships.map((r) => r.callee);
  const lines = valid_relationships.map((r) => r.line);
  const comments = valid_relationships.map((r) => r.comment || null);

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
 * Uses a recursive CTE for efficient single-query traversal.
 * Detects loops and truncates at max_depth to prevent infinite recursion.
 * @param {Object} params - Query parameters
 * @param {string} params.symbol - Symbol name of the root function
 * @param {number} params.project_id - The project ID
 * @param {number} [params.max_depth=5] - Maximum depth to traverse
 * @returns {Promise<Object>} Tree node with children array
 */
const build_call_tree = async ({ symbol, project_id, max_depth = 5 }) => {
  // Get the root entity
  const entities = await get_entity({ symbol, project_id, type: 'function' });
  const entity = entities[0];

  if (!entity) {
    return { children: [], symbol, not_found: true };
  }

  const root_id = entity.id;

  // Single query to fetch all relationships and nodes within max_depth
  // The CTE tracks the path to detect loops and depth for truncation
  const tree_data = await query`
    WITH RECURSIVE call_tree AS (
      -- Base case: direct callees of root (depth 1)
      SELECT
        r.caller,
        r.callee,
        r.line,
        1 as depth,
        ARRAY[r.caller] as path
      FROM relationship r
      WHERE r.caller = ${root_id}

      UNION ALL

      -- Recursive case: callees of callees
      SELECT
        r.caller,
        r.callee,
        r.line,
        ct.depth + 1,
        ct.path || r.caller
      FROM relationship r
      JOIN call_tree ct ON r.caller = ct.callee
      WHERE ct.depth < ${max_depth}
        AND NOT (r.callee = ANY(ct.path))  -- Loop detection
    ),
    -- Collect unique node IDs
    node_ids AS (
      SELECT caller AS id FROM call_tree
      UNION
      SELECT callee AS id FROM call_tree
      UNION
      SELECT ${root_id} AS id
    )
    -- Return edges with depth info, plus all node data
    SELECT
      'edge' AS row_type,
      ct.caller AS edge_from,
      ct.callee AS edge_to,
      ct.line AS edge_line,
      ct.depth AS edge_depth,
      NULL::int AS node_id,
      NULL::text AS node_symbol,
      NULL::text AS node_filename,
      NULL::int AS node_start_line,
      NULL::int AS node_end_line,
      NULL::text AS node_parameters,
      NULL::text AS node_return_type,
      NULL::text AS node_comment,
      NULL::text AS node_source
    FROM call_tree ct

    UNION ALL

    SELECT
      'node' AS row_type,
      NULL AS edge_from,
      NULL AS edge_to,
      NULL AS edge_line,
      NULL AS edge_depth,
      e.id AS node_id,
      e.symbol AS node_symbol,
      e.filename AS node_filename,
      e.start_line AS node_start_line,
      e.end_line AS node_end_line,
      e.parameters AS node_parameters,
      e.return_type AS node_return_type,
      e.comment AS node_comment,
      e.source AS node_source
    FROM node_ids ni
    JOIN entity e ON e.id = ni.id
  `;

  // Build lookup maps from query results
  const node_map = new Map();
  const children_map = new Map(); // parent_id -> [{callee_id, line}]

  for (const row of tree_data) {
    if (row.row_type === 'node') {
      node_map.set(row.node_id, {
        id: row.node_id,
        symbol: row.node_symbol,
        filename: row.node_filename,
        start_line: row.node_start_line,
        end_line: row.node_end_line,
        parameters: row.node_parameters,
        return_type: row.node_return_type,
        comment: row.node_comment,
        source: row.node_source
      });
    } else if (row.row_type === 'edge') {
      if (!children_map.has(row.edge_from)) {
        children_map.set(row.edge_from, []);
      }
      children_map.get(row.edge_from).push({
        callee_id: row.edge_to,
        line: row.edge_line
      });
    }
  }

  // Build tree structure recursively from the maps
  const build_node = (node_id, visited = new Set()) => {
    const node_data = node_map.get(node_id);
    if (!node_data) {
      return { symbol: 'unknown', not_found: true, children: [] };
    }

    const node = {
      ...node_data,
      children: []
    };

    // Check for loops
    if (visited.has(node_id)) {
      return { ...node, loop: true, children: [] };
    }
    visited.add(node_id);

    // Add children
    const child_edges = children_map.get(node_id) || [];
    for (const { callee_id, line } of child_edges) {
      const child = build_node(callee_id, new Set(visited));
      child.call_line = line;
      node.children.push(child);
    }

    return node;
  };

  return build_node(root_id);
};

/**
 * Build a full call graph starting from an entity, including both callers and callees.
 * Returns nodes and edges suitable for graph visualization (e.g., D3.js, Cytoscape).
 * Uses a single optimized recursive CTE to fetch both directions in one query.
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
  let root_entity = entities[0];
  if (filename) {
    const match = entities.find(
      (e) => e.filename === filename || e.filename.endsWith(filename)
    );
    if (match) {
      root_entity = match;
    }
  }

  const root_id = root_entity.id;

  // Single optimized query that fetches both callee and caller relationships
  // in one round-trip, then collects unique node IDs and fetches entity data separately.
  // Returns depth information so client can filter by depth without re-querying.
  // - callee_depth: distance from root following caller->callee (downstream)
  // - caller_depth: distance from root following callee->caller (upstream)
  const graph_data = await query`
    WITH RECURSIVE
    -- Traverse callees (functions called by root and descendants)
    -- Uses UNION (not UNION ALL) to prevent infinite loops from cycles
    callee_graph AS (
      SELECT r.caller, r.callee, r.line, 1 as depth
      FROM relationship r
      WHERE r.caller = ${root_id}

      UNION

      SELECT r.caller, r.callee, r.line, cg.depth + 1
      FROM relationship r
      JOIN callee_graph cg ON r.caller = cg.callee
      WHERE cg.depth < ${max_depth}
    ),
    -- Traverse callers (functions that call root and ancestors)
    -- Uses UNION (not UNION ALL) to prevent infinite loops from cycles
    caller_graph AS (
      SELECT r.caller, r.callee, r.line, 1 as depth
      FROM relationship r
      WHERE r.callee = ${root_id}

      UNION

      SELECT r.caller, r.callee, r.line, cg.depth + 1
      FROM relationship r
      JOIN caller_graph cg ON r.callee = cg.caller
      WHERE cg.depth < ${max_depth}
    ),
    -- Combine edges with their minimum depth from each direction
    -- An edge might be reachable from both directions at different depths
    all_edges AS (
      SELECT
        caller,
        callee,
        line,
        MIN(depth) as callee_depth,
        NULL::int as caller_depth
      FROM callee_graph
      GROUP BY caller, callee, line

      UNION ALL

      SELECT
        caller,
        callee,
        line,
        NULL::int as callee_depth,
        MIN(depth) as caller_depth
      FROM caller_graph
      GROUP BY caller, callee, line
    ),
    -- Merge edges that appear in both directions, taking min depth from each
    merged_edges AS (
      SELECT
        caller,
        callee,
        line,
        MIN(callee_depth) as callee_depth,
        MIN(caller_depth) as caller_depth
      FROM all_edges
      GROUP BY caller, callee, line
    ),
    -- Collect unique node IDs from edges
    node_ids AS (
      SELECT caller AS id FROM merged_edges
      UNION
      SELECT callee AS id FROM merged_edges
      UNION
      SELECT ${root_id} AS id
    )
    -- Return edges and nodes in a single result
    SELECT
      'edge' AS row_type,
      me.caller AS edge_from,
      me.callee AS edge_to,
      me.line AS edge_line,
      me.callee_depth AS edge_callee_depth,
      me.caller_depth AS edge_caller_depth,
      NULL::int AS node_id,
      NULL::text AS node_symbol,
      NULL::text AS node_filename,
      NULL::int AS node_start_line,
      NULL::int AS node_end_line,
      NULL::text AS node_parameters,
      NULL::text AS node_return_type,
      NULL::text AS node_comment
    FROM merged_edges me

    UNION ALL

    SELECT
      'node' AS row_type,
      NULL AS edge_from,
      NULL AS edge_to,
      NULL AS edge_line,
      NULL AS edge_callee_depth,
      NULL AS edge_caller_depth,
      e.id AS node_id,
      e.symbol AS node_symbol,
      e.filename AS node_filename,
      e.start_line AS node_start_line,
      e.end_line AS node_end_line,
      e.parameters AS node_parameters,
      e.return_type AS node_return_type,
      e.comment AS node_comment
    FROM node_ids ni
    JOIN entity e ON e.id = ni.id
  `;

  // Build graph from single query result
  const nodes = new Map();
  const edges = [];

  for (const row of graph_data) {
    if (row.row_type === 'node') {
      if (!nodes.has(row.node_id)) {
        nodes.set(row.node_id, {
          id: row.node_id,
          symbol: row.node_symbol,
          filename: row.node_filename,
          start_line: row.node_start_line,
          end_line: row.node_end_line,
          parameters: row.node_parameters,
          return_type: row.node_return_type,
          comment: row.node_comment,
          is_root: row.node_id === root_id
        });
      }
    } else if (row.row_type === 'edge') {
      edges.push({
        from: row.edge_from,
        to: row.edge_to,
        line: row.edge_line,
        callee_depth: row.edge_callee_depth,
        caller_depth: row.edge_caller_depth
      });
    }
  }

  return {
    root: root_entity.id,
    nodes: Array.from(nodes.values()),
    edges
  };
};

/**
 * Build a caller tree starting from a function, following callers recursively.
 * Returns a tree structure showing functions that call this function (and their callers).
 * Uses a recursive CTE for efficient single-query traversal.
 * @param {Object} params - Query parameters
 * @param {string} params.symbol - Symbol name of the root function
 * @param {number} params.project_id - The project ID
 * @param {number} [params.depth=1] - Maximum depth to traverse (-1 for unlimited, default 1)
 * @returns {Promise<Object>} Tree node with callers array
 */
const build_caller_tree = async ({ symbol, project_id, depth = 1 }) => {
  // Get the root entity
  const entities = await get_entity({ symbol, project_id, type: 'function' });
  const entity = entities[0];

  if (!entity) {
    return { symbol, not_found: true, callers: [] };
  }

  const root_id = entity.id;
  // -1 means unlimited, use a large number for the CTE
  const max_depth = depth === -1 ? 100 : depth;

  // Single query to fetch all caller relationships and nodes within max_depth
  const tree_data = await query`
    WITH RECURSIVE caller_tree AS (
      -- Base case: direct callers of root (depth 1)
      SELECT
        r.caller,
        r.callee,
        r.line,
        1 as depth,
        ARRAY[r.callee] as path
      FROM relationship r
      WHERE r.callee = ${root_id}

      UNION ALL

      -- Recursive case: callers of callers
      SELECT
        r.caller,
        r.callee,
        r.line,
        ct.depth + 1,
        ct.path || r.callee
      FROM relationship r
      JOIN caller_tree ct ON r.callee = ct.caller
      WHERE ct.depth < ${max_depth}
        AND NOT (r.caller = ANY(ct.path))  -- Loop detection
    ),
    -- Collect unique node IDs
    node_ids AS (
      SELECT caller AS id FROM caller_tree
      UNION
      SELECT callee AS id FROM caller_tree
      UNION
      SELECT ${root_id} AS id
    )
    -- Return edges plus all node data
    SELECT
      'edge' AS row_type,
      ct.caller AS edge_from,
      ct.callee AS edge_to,
      ct.line AS edge_line,
      NULL::int AS node_id,
      NULL::text AS node_symbol,
      NULL::text AS node_filename,
      NULL::int AS node_start_line,
      NULL::int AS node_end_line,
      NULL::text AS node_parameters,
      NULL::text AS node_return_type,
      NULL::text AS node_comment
    FROM caller_tree ct

    UNION ALL

    SELECT
      'node' AS row_type,
      NULL AS edge_from,
      NULL AS edge_to,
      NULL AS edge_line,
      e.id AS node_id,
      e.symbol AS node_symbol,
      e.filename AS node_filename,
      e.start_line AS node_start_line,
      e.end_line AS node_end_line,
      e.parameters AS node_parameters,
      e.return_type AS node_return_type,
      e.comment AS node_comment
    FROM node_ids ni
    JOIN entity e ON e.id = ni.id
  `;

  // Build lookup maps from query results
  const node_map = new Map();
  const callers_map = new Map(); // callee_id -> [{caller_id, line}]

  for (const row of tree_data) {
    if (row.row_type === 'node') {
      node_map.set(row.node_id, {
        id: row.node_id,
        symbol: row.node_symbol,
        filename: row.node_filename,
        start_line: row.node_start_line,
        end_line: row.node_end_line,
        parameters: row.node_parameters,
        return_type: row.node_return_type,
        comment: row.node_comment
      });
    } else if (row.row_type === 'edge') {
      if (!callers_map.has(row.edge_to)) {
        callers_map.set(row.edge_to, []);
      }
      callers_map.get(row.edge_to).push({
        caller_id: row.edge_from,
        line: row.edge_line
      });
    }
  }

  // Build tree structure recursively from the maps
  const build_node = (node_id, visited = new Set()) => {
    const node_data = node_map.get(node_id);
    if (!node_data) {
      return { symbol: 'unknown', not_found: true, callers: [] };
    }

    const node = {
      ...node_data,
      callers: []
    };

    // Check for loops
    if (visited.has(node_id)) {
      return { ...node, loop: true, callers: [] };
    }
    visited.add(node_id);

    // Add callers
    const caller_edges = callers_map.get(node_id) || [];
    for (const { caller_id, line } of caller_edges) {
      const child = build_node(caller_id, new Set(visited));
      child.call_line = line;
      node.callers.push(child);
    }

    return node;
  };

  return build_node(root_id);
};

/**
 * Build a callee tree starting from a function, following callees recursively.
 * Returns a tree structure showing functions called by this function (and what they call).
 * Uses a recursive CTE for efficient single-query traversal.
 * @param {Object} params - Query parameters
 * @param {string} params.symbol - Symbol name of the root function
 * @param {number} params.project_id - The project ID
 * @param {number} [params.depth=1] - Maximum depth to traverse (-1 for unlimited, default 1)
 * @returns {Promise<Object>} Tree node with callees array
 */
const build_callee_tree = async ({ symbol, project_id, depth = 1 }) => {
  // Get the root entity
  const entities = await get_entity({ symbol, project_id, type: 'function' });
  const entity = entities[0];

  if (!entity) {
    return { symbol, not_found: true, callees: [] };
  }

  const root_id = entity.id;
  // -1 means unlimited, use a large number for the CTE
  const max_depth = depth === -1 ? 100 : depth;

  // Single query to fetch all callee relationships and nodes within max_depth
  const tree_data = await query`
    WITH RECURSIVE callee_tree AS (
      -- Base case: direct callees of root (depth 1)
      SELECT
        r.caller,
        r.callee,
        r.line,
        1 as depth,
        ARRAY[r.caller] as path
      FROM relationship r
      WHERE r.caller = ${root_id}

      UNION ALL

      -- Recursive case: callees of callees
      SELECT
        r.caller,
        r.callee,
        r.line,
        ct.depth + 1,
        ct.path || r.caller
      FROM relationship r
      JOIN callee_tree ct ON r.caller = ct.callee
      WHERE ct.depth < ${max_depth}
        AND NOT (r.callee = ANY(ct.path))  -- Loop detection
    ),
    -- Collect unique node IDs
    node_ids AS (
      SELECT caller AS id FROM callee_tree
      UNION
      SELECT callee AS id FROM callee_tree
      UNION
      SELECT ${root_id} AS id
    )
    -- Return edges plus all node data
    SELECT
      'edge' AS row_type,
      ct.caller AS edge_from,
      ct.callee AS edge_to,
      ct.line AS edge_line,
      NULL::int AS node_id,
      NULL::text AS node_symbol,
      NULL::text AS node_filename,
      NULL::int AS node_start_line,
      NULL::int AS node_end_line,
      NULL::text AS node_parameters,
      NULL::text AS node_return_type,
      NULL::text AS node_comment
    FROM callee_tree ct

    UNION ALL

    SELECT
      'node' AS row_type,
      NULL AS edge_from,
      NULL AS edge_to,
      NULL AS edge_line,
      e.id AS node_id,
      e.symbol AS node_symbol,
      e.filename AS node_filename,
      e.start_line AS node_start_line,
      e.end_line AS node_end_line,
      e.parameters AS node_parameters,
      e.return_type AS node_return_type,
      e.comment AS node_comment
    FROM node_ids ni
    JOIN entity e ON e.id = ni.id
  `;

  // Build lookup maps from query results
  const node_map = new Map();
  const callees_map = new Map(); // caller_id -> [{callee_id, line}]

  for (const row of tree_data) {
    if (row.row_type === 'node') {
      node_map.set(row.node_id, {
        id: row.node_id,
        symbol: row.node_symbol,
        filename: row.node_filename,
        start_line: row.node_start_line,
        end_line: row.node_end_line,
        parameters: row.node_parameters,
        return_type: row.node_return_type,
        comment: row.node_comment
      });
    } else if (row.row_type === 'edge') {
      if (!callees_map.has(row.edge_from)) {
        callees_map.set(row.edge_from, []);
      }
      callees_map.get(row.edge_from).push({
        callee_id: row.edge_to,
        line: row.edge_line
      });
    }
  }

  // Build tree structure recursively from the maps
  const build_node = (node_id, visited = new Set()) => {
    const node_data = node_map.get(node_id);
    if (!node_data) {
      return { symbol: 'unknown', not_found: true, callees: [] };
    }

    const node = {
      ...node_data,
      callees: []
    };

    // Check for loops
    if (visited.has(node_id)) {
      return { ...node, loop: true, callees: [] };
    }
    visited.add(node_id);

    // Add callees
    const callee_edges = callees_map.get(node_id) || [];
    for (const { callee_id, line } of callee_edges) {
      const child = build_node(callee_id, new Set(visited));
      child.call_line = line;
      node.callees.push(child);
    }

    return node;
  };

  return build_node(root_id);
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
