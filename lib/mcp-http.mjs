'use strict';

/**
 * @fileoverview MCP HTTP transport setup for Hapi.js integration.
 * Provides streamable HTTP transport for the MCP server.
 * @module lib/mcp-http
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { get_all_projects_with_metadata } from './model/project.mjs';
import {
  get_entity,
  get_entity_symbols,
  entity_search
} from './model/entity.mjs';
import {
  build_call_tree,
  build_caller_tree,
  build_callee_tree,
  get_entities_by_caller_id,
  get_entities_by_callee_id
} from './model/relationship.mjs';
import { get_sourcecode } from './model/sourcecode.mjs';
import { text_at_position } from './sourcecode.mjs';
import { get_project_by_name } from './model/project.mjs';

import { tools } from './strings.mjs';

/**
 * Creates and configures the MCP server with all tools.
 * @returns {McpServer} Configured MCP server instance
 */
const createMcpServer = () => {
  const server = new McpServer({
    name: 'codebuddy',
    version: '1.0.0'
  });

  // Register all the same tools as in index.mjs
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

        return { content };
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

        return { content };
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

        return { content };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error ${err}` }],
          isError: true
        };
      }
    }
  );

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

        return { content };
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

        return { content };
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

        return { content };
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

        return { content };
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
      start_line: z
        .number()
        .optional()
        .describe('Start line of the source code'),
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
      filename,
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

  return server;
};

/**
 * Session manager for MCP HTTP transport.
 * Maps session IDs to their transport instances.
 */
const sessions = new Map();

/**
 * Creates a new MCP session with HTTP transport.
 * @returns {Object} Object containing the session ID and transport
 */
const createSession = async () => {
  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
  });

  await mcpServer.connect(transport);

  return { mcpServer, transport };
};

/**
 * Gets or creates a session for the given session ID.
 * @param {string|undefined} sessionId - The session ID from the request
 * @returns {Promise<Object>} The session object with mcpServer and transport
 */
const getOrCreateSession = async (sessionId) => {
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const session = await createSession();

  // Store session after initialization (when we have the session ID)
  session.transport._onsessioninitialized = (id) => {
    sessions.set(id, session);
  };

  session.transport._onsessionclosed = (id) => {
    sessions.delete(id);
  };

  return session;
};

/**
 * Hapi route handler for MCP HTTP transport.
 * Handles POST, GET, and DELETE methods for the /mcp endpoint.
 */
const mcpRouteHandler = async (request, h) => {
  const sessionId = request.headers['mcp-session-id'];

  try {
    const session = await getOrCreateSession(sessionId);
    const { transport } = session;

    // Start the transport if not already started
    if (!transport._started) {
      await transport.start();
    }

    // Get raw Node.js request and response objects from Hapi
    const req = request.raw.req;
    const res = request.raw.res;

    // For POST requests, pass the parsed body if available
    let parsedBody;
    if (request.method === 'post' && request.payload) {
      parsedBody = request.payload;
    }

    // Handle the request through the MCP transport
    await transport.handleRequest(req, res, parsedBody);

    // Return a takeover response since we're handling the response directly
    return h.abandon;
  } catch (err) {
    console.error('MCP HTTP error:', err);
    return h
      .response({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: err.message
        },
        id: null
      })
      .code(500)
      .type('application/json');
  }
};

/**
 * Hapi routes for MCP HTTP transport.
 * @type {Object[]}
 */
const mcpRoutes = [
  {
    method: 'POST',
    path: '/mcp',
    options: {
      payload: {
        parse: true,
        output: 'data'
      }
    },
    handler: mcpRouteHandler
  },
  {
    method: 'GET',
    path: '/mcp',
    handler: mcpRouteHandler
  },
  {
    method: 'DELETE',
    path: '/mcp',
    handler: mcpRouteHandler
  }
];

export { mcpRoutes, createMcpServer, getOrCreateSession };
