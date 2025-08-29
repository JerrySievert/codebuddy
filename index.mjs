import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  get_all_projects_with_metadata,
  get_project
} from './lib/model/project.mjs';
import { get_entity } from './lib/model/entity.mjs';
import {
  build_call_tree,
  get_entities_by_caller_id,
  get_entities_by_calling_id
} from './lib/model/relationship.mjs';
import { get_sourcecode } from './lib/model/sourcecode.mjs';
import { text_at_position } from './lib/sourcecode.mjs';

import { tools } from './lib/strings.mjs';

const server = new McpServer({
  name: 'code-knowledge-graph',
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
  tools[`retrieve_function`].name,
  tools['retrieve_function'].description,
  {
    function_name: z.string().describe('Name of the function to retrieve'),
    project_id: z
      .number()
      .optional()
      .describe('Project ID to retrieve function from')
  },
  async ({ function_name, project_id, type }) => {
    try {
      const entities = await get_entity({
        synbol: function_name,
        project_id,
        type
      });

      const content = [];
      for (const entity of entities) {
        const sources = await get_sourcecode({
          project_id: entity.project_id,
          filename: entity.filename
        });

        if (sources.length) {
          entity.source = text_at_position({
            source: sources[0].source,
            start_line: entity.start_line,
            end_line: entity.end_line
          });
        }

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
  tools[`retrieve_called_functions`].name,
  tools[`retrieve_called_functions`].description,
  {
    entity_id: z
      .number()
      .describe(
        'Entity ID of the symbol (function) to retrieve called functions for'
      )
  },
  async ({ entity_id }) => {
    try {
      const entities = await get_entities_by_caller_id(entity_id);

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
  tools[`retrieve_calling_functions`].name,
  tools[`retrieve_calling_functions`].description,
  {
    entity_id: z
      .number()
      .describe(
        'Entity ID of the symbol (function) to retrieve calling functions for'
      )
  },
  async ({ entity_id }) => {
    try {
      const entities = await get_entities_by_calling_id(entity_id);

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
  tools[`list_projects`].name,
  tools['list_projects'].description,
  {},
  async ({ entity_id }) => {
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
