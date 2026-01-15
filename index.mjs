import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { get_all_projects_with_metadata } from './lib/model/project.mjs';
import {
  get_entity,
  get_entity_symbols,
  entity_search
} from './lib/model/entity.mjs';
import {
  build_call_tree,
  build_caller_tree,
  build_callee_tree,
  get_entities_by_caller_id,
  get_entities_by_callee_id
} from './lib/model/relationship.mjs';
import { get_references_by_symbol } from './lib/model/reference.mjs';
import { get_sourcecode } from './lib/model/sourcecode.mjs';
import { text_at_position } from './lib/sourcecode.mjs';
import { get_project_by_name } from './lib/model/project.mjs';
import {
  find_all_references,
  go_to_definition,
  list_definitions,
  get_symbol_reference_summary,
  find_symbols_at_location,
  get_class_hierarchy,
  find_implementations,
  analyze_class_hierarchy,
  analyze_project_concurrency,
  analyze_project_resources
} from './lib/analysis.mjs';

import { tools } from './lib/strings.mjs';

const server = new McpServer({
  name: 'codebuddy',
  version: '1.0.0'
});

const check_arguments = (args, required) => {
  const missing = [];
  for (const arg of required) {
    if (args[arg] === undefined) {
      missing.push(arg);
    }
  }

  if (missing.length) {
    return `Missing the following argument${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`;
  }
};

server.tool(
  tools[`function_list`].name,
  tools[`function_list`].description,
  {
    project: z
      .string()
      .describe('Project name to retrieve the function list from'),
    filename: z
      .string()
      .optional()
      .describe('Filename to retrieve the function list from')
  },
  async ({ project, filename }) => {
    try {
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

      return {
        content: content
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);

server.tool(
  tools[`function_search`].name,
  tools[`function_search`].description,
  {
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
  async ({ name, project, filename, limit }) => {
    try {
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

      return {
        content: content
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);

server.tool(
  tools[`function_retrieve`].name,
  tools['function_retrieve'].description,
  {
    name: z.string().describe('Name of the function to retrieve'),
    project: z
      .string()
      .optional()
      .describe('Project name to retrieve function from')
  },
  async ({ name, project, filename }) => {
    try {
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

      return {
        content: content
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);
/*
server.tool(
  tools['generate_call_tree'].name,
  tools['generate_call_tree'].description,
  {
    symbol: z.string().describe('Symbol to generate call tree from'),
    project: z.string().describe('Project to generate call tree from')
  },
  async ({ project, symbol }) => {
    try {
      const entities = await get_entity({ project, symbol });

      const content = [];
      for (const entity of entities) {
        content.push({
          type: 'text',
          text: JSON.stringify(await build_call_tree(entity))
        });
      }

      return {
        content: content
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);
*/
server.tool(
  tools[`function_callers`].name,
  tools[`function_callers`].description,
  {
    name: z.string().describe('Function name to retrieve callers for'),
    project: z
      .string()
      .optional()
      .describe('Project to narrow the scope of the callers')
  },
  async ({ name, project }) => {
    try {
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

      return {
        content: content
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);

server.tool(
  tools[`function_callees`].name,
  tools[`function_callees`].description,
  {
    name: z.string().describe('Function name to retrieve callees for'),
    project: z
      .string()
      .optional()
      .describe('Project to narrow the scope of the callees')
  },
  async ({ name, project }) => {
    try {
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

      return {
        content: content
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);

server.tool(
  tools[`project_list`].name,
  tools['project_list'].description,
  {},
  async () => {
    try {
      const entities = await get_all_projects_with_metadata();

      const content = [];
      for (const entity of entities) {
        content.push({
          type: 'text',
          text: JSON.stringify(entity)
        });
      }

      return {
        content: content
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);

server.tool(
  tools[`project_info`].name,
  tools['project_info'].description,
  { name: z.string().describe('Project name') },
  async ({ name }) => {
    try {
      const project = await get_project_by_name({ name });

      if (project.length === 0) {
        throw new Error(`Project '${name}' not found`);
      }

      const content = [];
      content.push({
        type: 'text',
        text: JSON.stringify(project[0])
      });

      return {
        content: content
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);

server.tool(
  tools[`read_sourcecode`].name,
  tools[`read_sourcecode`].description,
  {
    project_id: z.number().describe('Project to read source code from'),
    filename: z.string().describe('Filename to read source code from'),
    start_line: z.number().optional().describe('Start line of the source code'),
    end_line: z.number().optional().describe('End line of the source code'),
    start_position: z
      .number()
      .optional()
      .describe('Start position of the source code'),
    end_position: z
      .number()
      .optional()
      .describe(
        'End position of the source code, if -1 then the full line will be returned'
      )
  },
  async ({
    project_id,
    path,
    start_line,
    end_line,
    start_position,
    end_position
  }) => {
    try {
      const source_obj = await get_sourcecode({
        project_id,
        filename
      });

      const source = source_obj[0].source;

      const extracted = text_at_position({
        source,
        start_line,
        end_line,
        start_position,
        end_position
      });

      return {
        content: [
          {
            type: 'text',
            text: extracted
          }
        ]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);

server.tool(
  tools[`function_caller_tree`].name,
  tools[`function_caller_tree`].description,
  {
    name: z.string().describe('Function name to retrieve caller tree for'),
    project: z.string().describe('Project name'),
    depth: z
      .number()
      .optional()
      .default(1)
      .describe('Depth of the tree (-1 for unlimited, default 1)')
  },
  async ({ name, project, depth }) => {
    try {
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
        content: [
          {
            type: 'text',
            text: JSON.stringify(tree)
          }
        ]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);

server.tool(
  tools[`function_callee_tree`].name,
  tools[`function_callee_tree`].description,
  {
    name: z.string().describe('Function name to retrieve callee tree for'),
    project: z.string().describe('Project name'),
    depth: z
      .number()
      .optional()
      .default(1)
      .describe('Depth of the tree (-1 for unlimited, default 1)')
  },
  async ({ name, project, depth }) => {
    try {
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
        content: [
          {
            type: 'text',
            text: JSON.stringify(tree)
          }
        ]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);

server.tool(
  tools[`entity_references`].name,
  tools[`entity_references`].description,
  {
    name: z.string().describe('Name of the struct or class to find references for'),
    project: z.string().describe('Project name'),
    type: z
      .string()
      .optional()
      .describe('Filter by reference type (variable, parameter, field, typedef, macro)')
  },
  async ({ name, project, type }) => {
    try {
      const projects = await get_project_by_name({ name: project });

      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const references = await get_references_by_symbol({
        symbol: name,
        project_id: projects[0].id,
        reference_type: type
      });

      if (references.length === 0) {
        return {
          content: [{ type: 'text', text: `No references found for '${name}'` }]
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(references) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error ${err}` }],
        isError: true
      };
    }
  }
);

// Cross-reference: Find all references to a symbol
server.tool(
  'symbol_references',
  `Finds all references to a symbol (function, class, variable, etc.) in a project. Returns all occurrences with context.`,
  {
    project: z.string().describe('Project name'),
    symbol: z.string().describe('Symbol name to find references for'),
    filename: z.string().optional().describe('Filter by filename'),
    definitions_only: z.boolean().optional().default(false).describe('Only return definitions')
  },
  async ({ project, symbol, filename, definitions_only }) => {
    try {
      const projects = await get_project_by_name({ name: project });
      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const result = await find_all_references(projects[0].id, symbol, {
        filename,
        definitions_only
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Cross-reference: Go to definition
server.tool(
  'go_to_definition',
  `Finds the definition of a symbol. Returns the location where the symbol is defined.`,
  {
    project: z.string().describe('Project name'),
    symbol: z.string().describe('Symbol name to find definition for'),
    filename: z.string().optional().describe('File where the reference is (for context)'),
    line: z.number().optional().describe('Line where the reference is (for context)')
  },
  async ({ project, symbol, filename, line }) => {
    try {
      const projects = await get_project_by_name({ name: project });
      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const result = await go_to_definition(projects[0].id, symbol, { filename, line });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Cross-reference: List all definitions
server.tool(
  'list_definitions',
  `Lists all symbol definitions in a project, optionally filtered by type.`,
  {
    project: z.string().describe('Project name'),
    type: z.string().optional().describe('Filter by symbol type (function, class, variable, parameter, etc.)')
  },
  async ({ project, type }) => {
    try {
      const projects = await get_project_by_name({ name: project });
      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const result = await list_definitions(projects[0].id, { symbol_type: type });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Cross-reference: Symbol reference summary
server.tool(
  'symbol_reference_summary',
  `Returns a summary of symbol references in a project, showing which symbols are most referenced.`,
  {
    project: z.string().describe('Project name')
  },
  async ({ project }) => {
    try {
      const projects = await get_project_by_name({ name: project });
      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const result = await get_symbol_reference_summary(projects[0].id);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Cross-reference: Symbols at location
server.tool(
  'symbols_at_location',
  `Finds symbols at a specific location in a file. Useful for hover functionality.`,
  {
    project: z.string().describe('Project name'),
    filename: z.string().describe('Filename'),
    line: z.number().describe('Line number'),
    column: z.number().optional().describe('Column number for precise matching')
  },
  async ({ project, filename, line, column }) => {
    try {
      const projects = await get_project_by_name({ name: project });
      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const result = await find_symbols_at_location(projects[0].id, filename, line, column);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Class hierarchy: Get hierarchy tree for a class
server.tool(
  'class_hierarchy',
  `Gets the inheritance hierarchy tree for a class or struct. Can traverse up (parents/ancestors), down (children/descendants), or both.`,
  {
    project: z.string().describe('Project name'),
    symbol: z.string().describe('Class or struct symbol name'),
    direction: z.enum(['up', 'down', 'both']).optional().default('both').describe('Direction to traverse: up (ancestors), down (descendants), or both'),
    max_depth: z.number().optional().default(10).describe('Maximum depth to traverse')
  },
  async ({ project, symbol, direction, max_depth }) => {
    try {
      const projects = await get_project_by_name({ name: project });
      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const result = await get_class_hierarchy(projects[0].id, symbol, { direction, max_depth });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Class hierarchy: Find implementations
server.tool(
  'interface_implementations',
  `Finds all classes that implement a specific interface or extend a class.`,
  {
    project: z.string().describe('Project name'),
    symbol: z.string().describe('Interface or base class symbol name')
  },
  async ({ project, symbol }) => {
    try {
      const projects = await get_project_by_name({ name: project });
      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const result = await find_implementations(projects[0].id, symbol);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Class hierarchy: Full project hierarchy analysis
server.tool(
  'analysis_hierarchy',
  `Analyzes the complete class hierarchy of a project. Shows inheritance relationships, root classes, leaf classes, and depth statistics.`,
  {
    project: z.string().describe('Project name')
  },
  async ({ project }) => {
    try {
      const projects = await get_project_by_name({ name: project });
      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const result = await analyze_class_hierarchy(projects[0].id);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Concurrency analysis
server.tool(
  'analysis_concurrency',
  `Analyzes concurrency patterns in a project. Detects async/await, threads, locks, synchronization primitives, and potential race conditions.`,
  {
    project: z.string().describe('Project name')
  },
  async ({ project }) => {
    try {
      const projects = await get_project_by_name({ name: project });
      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const result = await analyze_project_concurrency(projects[0].id);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

// Resource analysis
server.tool(
  'analysis_resources',
  `Analyzes memory and resource management patterns in a project. Detects resource acquisition/release, smart pointers, RAII patterns, and potential resource leaks.`,
  {
    project: z.string().describe('Project name')
  },
  async ({ project }) => {
    try {
      const projects = await get_project_by_name({ name: project });
      if (projects.length === 0) {
        throw new Error(`Project '${project}' not found`);
      }

      const result = await analyze_project_resources(projects[0].id);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
