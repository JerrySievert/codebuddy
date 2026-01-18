'use strict';

/**
 * @fileoverview MCP tool handlers for function operations.
 * @module lib/mcp/tools/function
 */

import { z } from 'zod';
import { get_project_by_name } from '../../model/project.mjs';
import {
  get_entity,
  get_entity_symbols,
  entity_search
} from '../../model/entity.mjs';
import {
  get_entities_by_caller_id,
  get_entities_by_callee_id,
  build_caller_tree,
  build_callee_tree,
  build_call_graph
} from '../../model/relationship.mjs';
import { get_sourcecode } from '../../model/sourcecode.mjs';
import { calculate_complexity } from '../../complexity.mjs';
import { build_control_flow_from_source } from '../../controlflow.mjs';
import { tools } from '../../strings.mjs';

// =============================================================================
// Handler Functions (testable independently)
// =============================================================================

/**
 * Lists all functions in a project, optionally filtered by filename.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @param {string} [params.filename] - Optional filename filter
 * @returns {Promise<Object>} MCP response with function list
 */
export const function_list_handler = async ({ project, filename }) => {
  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }

  const symbols = await get_entity_symbols({
    project_id: projects[0].id,
    filename,
    type: 'function'
  });

  const content = [];
  for (const symbol of symbols) {
    content.push({
      type: 'text',
      text: JSON.stringify(symbol)
    });
  }

  return { content };
};

/**
 * Searches for functions by name.
 * @param {Object} params - Parameters
 * @param {string} params.name - Function name to search for
 * @param {string} [params.project] - Optional project filter
 * @param {string} [params.filename] - Optional filename filter
 * @param {number} [params.limit=10] - Maximum results to return
 * @returns {Promise<Object>} MCP response with search results
 */
export const function_search_handler = async ({
  name,
  project,
  filename,
  limit = 10
}) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const symbols = await entity_search({
    project_id,
    filename,
    symbol: name,
    type: 'function',
    limit
  });

  if (symbols.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  const content = [];
  for (const symbol of symbols) {
    content.push({
      type: 'text',
      text: JSON.stringify(symbol)
    });
  }

  return { content };
};

/**
 * Retrieves detailed information about a function.
 * @param {Object} params - Parameters
 * @param {string} params.name - Function name
 * @param {string} [params.project] - Optional project filter
 * @param {string} [params.filename] - Optional filename filter
 * @returns {Promise<Object>} MCP response with function details
 */
export const function_retrieve_handler = async ({ name, project, filename }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const entities = await get_entity({
    project_id,
    filename,
    symbol: name,
    type: 'function'
  });

  if (entities.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  const content = [];
  for (const entity of entities) {
    content.push({
      type: 'text',
      text: JSON.stringify(entity)
    });
  }

  return { content };
};

/**
 * Retrieves all functions that call a given function.
 * @param {Object} params - Parameters
 * @param {string} params.name - Function name
 * @param {string} [params.project] - Optional project filter
 * @returns {Promise<Object>} MCP response with caller list
 */
export const function_callers_handler = async ({ name, project }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const entities = await get_entities_by_callee_id({
    project_id,
    symbol: name,
    type: 'function'
  });

  if (entities.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  const content = [];
  for (const entity of entities) {
    content.push({
      type: 'text',
      text: JSON.stringify(entity)
    });
  }

  return { content };
};

/**
 * Retrieves all functions called by a given function.
 * @param {Object} params - Parameters
 * @param {string} params.name - Function name
 * @param {string} [params.project] - Optional project filter
 * @returns {Promise<Object>} MCP response with callee list
 */
export const function_callees_handler = async ({ name, project }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const entities = await get_entities_by_caller_id({
    project_id,
    symbol: name,
    type: 'function'
  });

  if (entities.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  const content = [];
  for (const entity of entities) {
    content.push({
      type: 'text',
      text: JSON.stringify(entity)
    });
  }

  return { content };
};

/**
 * Builds a caller tree for a function.
 * @param {Object} params - Parameters
 * @param {string} params.name - Function name
 * @param {string} params.project - Project name
 * @param {number} [params.depth=1] - Tree depth (-1 for unlimited)
 * @returns {Promise<Object>} MCP response with caller tree
 */
export const function_caller_tree_handler = async ({
  name,
  project,
  depth = 1
}) => {
  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }

  const tree = await build_caller_tree({
    symbol: name,
    project_id: projects[0].id,
    depth
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(tree) }]
  };
};

/**
 * Builds a callee tree for a function.
 * @param {Object} params - Parameters
 * @param {string} params.name - Function name
 * @param {string} params.project - Project name
 * @param {number} [params.depth=1] - Tree depth (-1 for unlimited)
 * @returns {Promise<Object>} MCP response with callee tree
 */
export const function_callee_tree_handler = async ({
  name,
  project,
  depth = 1
}) => {
  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }

  const tree = await build_callee_tree({
    symbol: name,
    project_id: projects[0].id,
    depth
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(tree) }]
  };
};

/**
 * Builds a bidirectional call graph centered on a function.
 * @param {Object} params - Parameters
 * @param {string} params.name - Function name
 * @param {string} [params.project] - Project name
 * @param {string} [params.filename] - Filename to disambiguate
 * @param {number} [params.depth=10] - Max depth (0 for unlimited, min 2)
 * @returns {Promise<Object>} MCP response with call graph
 */
export const function_callgraph_handler = async ({
  name,
  project,
  filename,
  depth = 10
}) => {
  let project_id;
  if (project) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  let max_depth = depth || 10;
  if (max_depth !== 0 && max_depth < 2) max_depth = 2;
  if (max_depth === 0) max_depth = 100;

  const graph = await build_call_graph({
    symbol: name,
    project_id,
    filename,
    max_depth
  });

  if (!graph.root) {
    throw new Error(`Function '${name}' not found`);
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(graph) }]
  };
};

/**
 * Calculates complexity metrics for a function.
 * @param {Object} params - Parameters
 * @param {string} params.name - Function name
 * @param {string} [params.project] - Project name
 * @param {string} [params.filename] - Filename to disambiguate
 * @returns {Promise<Object>} MCP response with complexity metrics
 */
export const function_complexity_handler = async ({ name, project, filename }) => {
  let project_id;
  if (project) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await get_entity({
    project_id,
    filename,
    symbol: name,
    type: 'function'
  });

  if (results.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  const complexities = results.map((entity) => ({
    id: entity.id,
    symbol: entity.symbol,
    filename: entity.filename,
    language: entity.language,
    complexity: calculate_complexity(entity)
  }));

  return {
    content: [{ type: 'text', text: JSON.stringify(complexities) }]
  };
};

/**
 * Generates control flow graph for a function.
 * @param {Object} params - Parameters
 * @param {string} params.name - Function name
 * @param {string} params.project - Project name
 * @param {string} [params.filename] - Filename to disambiguate
 * @returns {Promise<Object>} MCP response with control flow graph
 */
export const function_controlflow_handler = async ({ name, project, filename }) => {
  const projects = await get_project_by_name({ name: project });
  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }

  const project_id = projects[0].id;

  const entities = await get_entity({
    project_id,
    symbol: name,
    filename,
    type: 'function'
  });

  if (entities.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  let entity = entities[0];
  if (filename) {
    const match = entities.find(
      (e) => e.filename === filename || e.filename.endsWith(filename)
    );
    if (match) entity = match;
  }

  const source_records = await get_sourcecode({
    project_id,
    filename: entity.filename
  });

  if (source_records.length === 0) {
    throw new Error('Source code not found');
  }

  const source = source_records[0].source;
  const cfg = build_control_flow_from_source(
    source,
    entity.language,
    entity.start_line,
    entity.end_line
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          function: {
            symbol: entity.symbol,
            filename: entity.filename,
            start_line: entity.start_line,
            end_line: entity.end_line,
            language: entity.language
          },
          ...cfg
        })
      }
    ]
  };
};

// =============================================================================
// Tool Definitions (for registration)
// =============================================================================

export const function_tools = [
  {
    name: tools['function_list'].name,
    description: tools['function_list'].description,
    schema: {
      project: z
        .string()
        .describe('Project name to retrieve the function list from'),
      filename: z
        .string()
        .optional()
        .describe('Filename to retrieve the function list from')
    },
    handler: function_list_handler
  },
  {
    name: tools['function_search'].name,
    description: tools['function_search'].description,
    schema: {
      name: z.string().describe('Name of the function to search for'),
      project: z
        .string()
        .optional()
        .describe('Project name in which to search for the function'),
      filename: z
        .string()
        .optional()
        .describe('Filename in which to search for the function'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of results to return')
    },
    handler: function_search_handler
  },
  {
    name: tools['function_retrieve'].name,
    description: tools['function_retrieve'].description,
    schema: {
      name: z.string().describe('Name of the function to retrieve'),
      project: z
        .string()
        .optional()
        .describe('Project name to retrieve function from')
    },
    handler: function_retrieve_handler
  },
  {
    name: tools['function_callers'].name,
    description: tools['function_callers'].description,
    schema: {
      name: z.string().describe('Function name to retrieve callers for'),
      project: z
        .string()
        .optional()
        .describe('Project to narrow the scope of the callers')
    },
    handler: function_callers_handler
  },
  {
    name: tools['function_callees'].name,
    description: tools['function_callees'].description,
    schema: {
      name: z.string().describe('Function name to retrieve callees for'),
      project: z
        .string()
        .optional()
        .describe('Project to narrow the scope of the callees')
    },
    handler: function_callees_handler
  },
  {
    name: tools['function_caller_tree'].name,
    description: tools['function_caller_tree'].description,
    schema: {
      name: z.string().describe('Function name to retrieve caller tree for'),
      project: z.string().describe('Project name'),
      depth: z
        .number()
        .optional()
        .default(1)
        .describe('Depth of the tree (-1 for unlimited, default 1)')
    },
    handler: function_caller_tree_handler
  },
  {
    name: tools['function_callee_tree'].name,
    description: tools['function_callee_tree'].description,
    schema: {
      name: z.string().describe('Function name to retrieve callee tree for'),
      project: z.string().describe('Project name'),
      depth: z
        .number()
        .optional()
        .default(1)
        .describe('Depth of the tree (-1 for unlimited, default 1)')
    },
    handler: function_callee_tree_handler
  },
  {
    name: 'function_callgraph',
    description: `Builds a bidirectional call graph centered on a function. Shows both callers (functions that call this function) and callees (functions this function calls) as a graph structure suitable for visualization.

Returns a graph with:
- root: The center function node
- nodes: Array of all function nodes in the graph
- edges: Array of caller->callee relationships

Use depth parameter to control how far to traverse (default 10, 0 for unlimited).`,
    schema: {
      name: z.string().describe('Function name to center the graph on'),
      project: z.string().optional().describe('Project name to filter by'),
      filename: z
        .string()
        .optional()
        .describe(
          'Filename to disambiguate if multiple functions have the same name'
        ),
      depth: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum depth to traverse (0 for unlimited, min 2)')
    },
    handler: function_callgraph_handler
  },
  {
    name: 'function_complexity',
    description: `Calculates complexity metrics for a function including:
- cyclomatic: Cyclomatic complexity (number of independent paths)
- loc: Lines of code
- nesting_depth: Maximum nesting depth of control structures
- parameter_count: Number of parameters
- rating: Complexity rating (A-F scale)

Higher cyclomatic complexity indicates more complex, harder to test code. Generally:
- 1-10: Simple, low risk
- 11-20: Moderate complexity
- 21-50: High complexity, consider refactoring
- 50+: Very high risk, should be refactored`,
    schema: {
      name: z.string().describe('Function name to analyze'),
      project: z.string().optional().describe('Project name'),
      filename: z.string().optional().describe('Filename to disambiguate')
    },
    handler: function_complexity_handler
  },
  {
    name: 'function_controlflow',
    description: `Generates a control flow graph (CFG) for a function. The CFG shows the flow of execution through the function, including:
- Entry and exit points
- Conditional branches (if/else, switch)
- Loops (for, while, do-while)
- Exception handling (try/catch/finally)

Returns nodes and edges that can be used to render a flowchart visualization.`,
    schema: {
      name: z.string().describe('Function name'),
      project: z.string().describe('Project name (required)'),
      filename: z.string().optional().describe('Filename to disambiguate')
    },
    handler: function_controlflow_handler
  }
];
