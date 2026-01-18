'use strict';

/**
 * @fileoverview MCP HTTP transport setup for Hapi.js integration.
 * Provides streamable HTTP transport for the MCP server.
 * @module lib/mcp-http
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';

import { register_all_tools } from './mcp/tools.mjs';

/**
 * Creates and configures the MCP server with all tools.
 * @returns {McpServer} Configured MCP server instance
 */
const create_mcp_server = () => {
  const server = new McpServer({
    name: 'codebuddy',
    version: '1.0.0'
  });

  // Register all MCP tools
  register_all_tools(server);

  return server;
};

/**
 * Session manager for MCP HTTP transport.
 * Maps session IDs to their transport instances.
 */
const transports = {};

/**
 * Hapi route handler for MCP HTTP transport.
 * Handles POST, GET, and DELETE methods for the /mcp endpoint.
 */
const mcp_route_handler = async (request, h) => {
  const session_id = request.headers['mcp-session-id'];

  // Get raw Node.js request and response objects from Hapi
  const req = request.raw.req;
  const res = request.raw.res;

  // For POST requests, get the parsed body
  const body = request.method === 'post' ? request.payload : undefined;

  try {
    let transport;

    if (session_id && transports[session_id]) {
      // Reuse existing transport for established sessions
      transport = transports[session_id];
    } else if (!session_id && isInitializeRequest(body)) {
      // New initialization request - create new transport
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          // Store transport when session is initialized
          transports[sid] = transport;
        }
      });

      // Set up close handler to clean up
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      // Connect transport to MCP server before handling request
      const mcp_server = create_mcp_server();
      await mcp_server.connect(transport);
    } else if (!session_id) {
      // No session ID and not an initialize request
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message:
              'Bad Request: No session ID provided and not an initialization request'
          },
          id: null
        })
      );
      return h.abandon;
    } else {
      // Session ID provided but transport not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Bad Request: Session not found'
          },
          id: null
        })
      );
      return h.abandon;
    }

    // Handle the request through the MCP transport
    await transport.handleRequest(req, res, body);
    return h.abandon;
  } catch (err) {
    console.error('MCP HTTP error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: err.message
        },
        id: null
      })
    );
    return h.abandon;
  }
};

/**
 * Hapi routes for MCP HTTP transport.
 * @type {Object[]}
 */
const mcp_routes = [
  {
    method: 'POST',
    path: '/mcp',
    options: {
      payload: {
        parse: true,
        output: 'data'
      }
    },
    handler: mcp_route_handler
  },
  {
    method: 'GET',
    path: '/mcp',
    handler: mcp_route_handler
  },
  {
    method: 'DELETE',
    path: '/mcp',
    handler: mcp_route_handler
  }
];

export { create_mcp_server, mcp_routes, mcp_route_handler };
