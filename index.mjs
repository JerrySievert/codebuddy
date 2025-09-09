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
  get_entities_by_caller_id,
  get_entities_by_callee_id
} from './lib/model/relationship.mjs';
import { get_sourcecode } from './lib/model/sourcecode.mjs';
import { text_at_position } from './lib/sourcecode.mjs';
import { get_project_by_name } from './lib/model/project.mjs';

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

const transport = new StdioServerTransport();
await server.connect(transport);
