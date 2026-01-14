'use strict';

import { get_project_by_name } from '../../model/project.mjs';
import {
  get_entity_symbols,
  entity_search,
  get_entity
} from '../../model/entity.mjs';
import {
  get_entities_by_caller_id,
  get_entities_by_callee_id,
  build_call_graph,
  build_caller_tree,
  build_callee_tree
} from '../../model/relationship.mjs';
import { get_sourcecode } from '../../model/sourcecode.mjs';
import { build_control_flow_from_source } from '../../controlflow.mjs';

const help = `usage: cb function [<args>]

Gives access to functions, allowing for listing, searching, and usage of functions.

  * list - Provides a list of known functions
  * search - Searches for a function
  * retrieve - Retrieves the function and information about it
  * callers - Lists any functions that call this function
  * callees - Lists any functions that this function calls
  * caller-tree - Builds a tree of callers (who calls this function)
  * callee-tree - Builds a tree of callees (what this function calls)
  * call-graph - Builds a bidirectional call graph centered on a function
  * control-flow - Shows the control flow graph for a function
`;

const list_help = `usage: cb function list --project=<project_name> [--filename=<file_name>]

List all functions that are currently known.
`;

const search_help = `usage: cb function search --name=[name] [--project=<project>] [--filename=<filename>]

Search for a function by name.  Partial matches will be returned, and the
search is case-insensitive.

Arguments:

  * --name=[name] - Name of the function to search for (required)
  * --project=[project] - Name of the project to narrow the search
  * --filename=[filename] - Name of the file to search in
`;

const retrieve_help = `usage: cb function retrieve --name=[name] [--project=<project>] [--filename=<filename>]

Retrieve the function and information about it.

Arguments:

  * --name=[name] - Name of the function to retrieve (required)
  * --project=[project] - Name of the project to narrow the search
  * --filename=[filename] - Name of the file to search in
`;

const callers_help = `usage: cb function callers --name=[name] [--project=<project>]

Retrieve all callers known for a function and information for them.

Arguments:

  * --name=[name] - Name of the function to retrieve callers for (required)
  * --project=[project] - Only retrieve callers from this project
`;

const callees_help = `usage: cb function callees --name=[name] [--project=<project>]

Retrieve all callees known for a function and information for them.

Arguments:

  * --name=[name] - Name of the function to retrieve callees for (required)
  * --project=[project] - Only retrieve callees from this project
`;

const call_graph_help = `usage: cb function call-graph --name=[name] --project=<project> [--depth=<depth>] [--filename=<filename>]

Build a bidirectional call graph centered on a function, showing both
callers and callees.

Arguments:

  * --name=[name] - Name of the function to center the graph on (required)
  * --project=[project] - Name of the project (required)
  * --depth=[depth] - Maximum depth to traverse (default 3, max 5)
  * --filename=[filename] - Filename to disambiguate if multiple functions have the same name
`;

const caller_tree_help = `usage: cb function caller-tree --name=[name] --project=<project> [--depth=<depth>]

Build a tree showing all functions that call the specified function,
recursively to the given depth.

Arguments:

  * --name=[name] - Name of the function (required)
  * --project=[project] - Name of the project (required)
  * --depth=[depth] - Maximum depth to traverse (default 3)
`;

const callee_tree_help = `usage: cb function callee-tree --name=[name] --project=<project> [--depth=<depth>]

Build a tree showing all functions called by the specified function,
recursively to the given depth.

Arguments:

  * --name=[name] - Name of the function (required)
  * --project=[project] - Name of the project (required)
  * --depth=[depth] - Maximum depth to traverse (default 3)
`;

const control_flow_help = `usage: cb function control-flow --name=[name] --project=<project> [--filename=<filename>]

Show the control flow graph for a function, displaying branches,
loops, and other control structures.

Arguments:

  * --name=[name] - Name of the function (required)
  * --project=[project] - Name of the project (required)
  * --filename=[filename] - Filename to disambiguate
`;

const function_list = async ({ project, filename }) => {
  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }

  const symbols = await get_entity_symbols({
    project_id: projects[0].id,
    filename,
    type: 'function'
  });

  console.log(`Functions:\n`);
  for (const symbol of symbols) {
    console.log(
      `  * ${symbol.symbol}${symbol.parameters} - ${symbol.filename}:${symbol.start_line}`
    );
  }
};

const function_search = async ({ name, project, filename, limit }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });

    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await entity_search({
    project_id,
    filename,
    symbol: name,
    type: 'function',
    limit
  });

  if (results.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  console.log(`Functions:\n`);
  for (const symbol of results) {
    console.log(
      `  * ${symbol.symbol}${symbol.parameters} - ${symbol.filename}:${symbol.start_line}`
    );
  }
};

const function_retrieve = async ({ name, project, filename }) => {
  let project_id;
  if (project !== undefined) {
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

  // We should only have one function.
  const [function_symbol] = results;
  console.log(`Function:\n`);
  console.log(
    `${function_symbol.symbol}${function_symbol.parameters} - ${function_symbol.filename}:${function_symbol.start_line}

${function_symbol.comment}
${function_symbol.source}
`
  );
};

const function_callers = async ({ name, project }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });

    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await get_entities_by_callee_id({
    project_id,
    symbol: name,
    type: 'function'
  });

  if (results.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  console.log(`Calls made to ${name}:\n`);
  // Iterate through the function symbols and print them.
  for (const caller of results) {
    console.log(
      `  * ${caller.caller_symbol} ${caller.caller_filename}:${caller.caller_start_line}`
    );
  }
};

const function_callees = async ({ name, project }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });

    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await get_entities_by_caller_id({
    project_id,
    symbol: name,
    type: 'function'
  });

  if (results.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  console.log(`Calls made from ${name}:\n`);
  // Iterate through the function symbols and print them.
  for (const caller of results) {
    console.log(
      `  * ${caller.callee_symbol}${caller.callee_parameters} ${caller.caller_filename}:${caller.relationship_line} => ${caller.callee_filename}:${caller.callee_start_line}`
    );
  }
};

// Helper to print call graph tree
const printCallGraphNode = (node, prefix = '', isLast = true, direction = 'root') => {
  const connector = prefix === '' ? '' : (isLast ? '└── ' : '├── ');
  const dirIndicator = direction === 'caller' ? '← ' : direction === 'callee' ? '→ ' : '';

  console.log(`${prefix}${connector}${dirIndicator}${node.symbol} (${node.filename}:${node.start_line})`);

  const newPrefix = prefix + (prefix === '' ? '' : (isLast ? '    ' : '│   '));

  // Print callers
  if (node.callers && node.callers.length > 0) {
    for (let i = 0; i < node.callers.length; i++) {
      printCallGraphNode(node.callers[i], newPrefix, i === node.callers.length - 1 && (!node.callees || node.callees.length === 0), 'caller');
    }
  }

  // Print callees
  if (node.callees && node.callees.length > 0) {
    for (let i = 0; i < node.callees.length; i++) {
      printCallGraphNode(node.callees[i], newPrefix, i === node.callees.length - 1, 'callee');
    }
  }
};

// Helper to print tree nodes recursively
const printTreeNode = (node, prefix = '', isLast = true) => {
  const connector = prefix === '' ? '' : (isLast ? '└── ' : '├── ');
  const params = node.parameters || '';
  console.log(`${prefix}${connector}${node.symbol}${params} (${node.filename}:${node.start_line})`);

  const children = node.callers || node.callees || [];
  const newPrefix = prefix + (prefix === '' ? '' : (isLast ? '    ' : '│   '));

  for (let i = 0; i < children.length; i++) {
    printTreeNode(children[i], newPrefix, i === children.length - 1);
  }
};

const function_caller_tree = async ({ name, project, depth = 3 }) => {
  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }

  const tree = await build_caller_tree({
    symbol: name,
    project_id: projects[0].id,
    depth
  });

  if (!tree || !tree.symbol) {
    throw new Error(`Function '${name}' not found`);
  }

  console.log(`\n=== Caller Tree for ${name} ===\n`);
  console.log(`Functions that call ${name} (depth: ${depth}):\n`);

  printTreeNode(tree);
};

const function_callee_tree = async ({ name, project, depth = 3 }) => {
  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }

  const tree = await build_callee_tree({
    symbol: name,
    project_id: projects[0].id,
    depth
  });

  if (!tree || !tree.symbol) {
    throw new Error(`Function '${name}' not found`);
  }

  console.log(`\n=== Callee Tree for ${name} ===\n`);
  console.log(`Functions called by ${name} (depth: ${depth}):\n`);

  printTreeNode(tree);
};

const function_call_graph = async ({ name, project, depth = 3, filename }) => {
  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }

  const graph = await build_call_graph({
    symbol: name,
    project_id: projects[0].id,
    filename,
    max_depth: Math.min(depth, 5)
  });

  if (!graph.root) {
    throw new Error(`Function '${name}' not found`);
  }

  console.log(`\n=== Call Graph for ${name} ===\n`);
  console.log(`Legend: ← caller, → callee\n`);

  printCallGraphNode(graph.root);

  console.log(`\nStatistics:`);
  console.log(`  Total callers: ${graph.stats?.totalCallers || 0}`);
  console.log(`  Total callees: ${graph.stats?.totalCallees || 0}`);
};

const function_control_flow = async ({ name, project, filename }) => {
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
    const match = entities.find(e => e.filename === filename || e.filename.endsWith(filename));
    if (match) entity = match;
  }

  const source_records = await get_sourcecode({
    project_id,
    filename: entity.filename
  });

  if (source_records.length === 0) {
    throw new Error('Source code not found');
  }

  const cfg = build_control_flow_from_source(
    source_records[0].source,
    entity.language,
    entity.start_line,
    entity.end_line
  );

  console.log(`\n=== Control Flow Graph: ${entity.symbol} ===`);
  console.log(`File: ${entity.filename}:${entity.start_line}-${entity.end_line}`);
  console.log(`Language: ${entity.language}\n`);

  if (!cfg.nodes || cfg.nodes.length === 0) {
    console.log('No control flow nodes found.');
    return;
  }

  console.log(`Nodes (${cfg.nodes.length}):\n`);
  for (const node of cfg.nodes) {
    const label = node.label || node.type;
    console.log(`  [${node.id}] ${node.type}: ${label}`);
    if (node.code) {
      const codePreview = node.code.length > 60 ? node.code.substring(0, 60) + '...' : node.code;
      console.log(`       Code: ${codePreview.replace(/\n/g, ' ')}`);
    }
  }

  if (cfg.edges && cfg.edges.length > 0) {
    console.log(`\nEdges (${cfg.edges.length}):\n`);
    for (const edge of cfg.edges) {
      const label = edge.label ? ` [${edge.label}]` : '';
      console.log(`  ${edge.from} -> ${edge.to}${label}`);
    }
  }
};

const func = {
  command: 'function',
  description: 'Tools for querying functions',
  commands: {
    list: function_list,
    search: function_search,
    retrieve: function_retrieve,
    callers: function_callers,
    callees: function_callees,
    'caller-tree': function_caller_tree,
    'callee-tree': function_callee_tree,
    'call-graph': function_call_graph,
    'control-flow': function_control_flow
  },
  help,
  command_help: {
    list: list_help,
    search: search_help,
    retrieve: retrieve_help,
    callers: callers_help,
    callees: callees_help,
    'caller-tree': caller_tree_help,
    'callee-tree': callee_tree_help,
    'call-graph': call_graph_help,
    'control-flow': control_flow_help
  },
  command_arguments: {
    'caller-tree': {
      name: {
        type: 'string',
        description: 'Name of the function',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      depth: {
        type: 'number',
        description: 'Maximum depth to traverse (default 3)'
      }
    },
    'callee-tree': {
      name: {
        type: 'string',
        description: 'Name of the function',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      depth: {
        type: 'number',
        description: 'Maximum depth to traverse (default 3)'
      }
    },
    list: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      filename: {
        type: 'string',
        description: 'Filename to limit list to'
      }
    },
    search: {
      name: {
        type: 'string',
        description: 'Name of the function to search for',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project'
      },
      filename: {
        type: 'string',
        description: 'Filename to limit list to'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default 10)'
      }
    },
    retrieve: {
      name: {
        type: 'string',
        description: 'Name of the function to retrieve',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project'
      },
      filename: {
        type: 'string',
        description: 'Filename to limit list to'
      }
    },
    callers: {
      name: {
        type: 'string',
        description: 'Name of the function to find callers for',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project'
      },
      filename: {
        type: 'string',
        description: 'Filename to limit list to'
      }
    },
    callees: {
      name: {
        type: 'string',
        description: 'Name of the function to find callees for',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project'
      },
      filename: {
        type: 'string',
        description: 'Filename to limit list to'
      }
    },
    'call-graph': {
      name: {
        type: 'string',
        description: 'Name of the function to center the graph on',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      depth: {
        type: 'number',
        description: 'Maximum depth to traverse (default 3, max 5)'
      },
      filename: {
        type: 'string',
        description: 'Filename to disambiguate'
      }
    },
    'control-flow': {
      name: {
        type: 'string',
        description: 'Name of the function',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      filename: {
        type: 'string',
        description: 'Filename to disambiguate'
      }
    }
  }
};

export { func };
