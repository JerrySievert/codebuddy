'use strict';

/**
 * @fileoverview MCP server entry point using stdio transport.
 * @module index
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { register_all_tools } from './lib/mcp/tools.mjs';

const server = new McpServer({
  name: 'codebuddy',
  version: '1.0.0'
});

// Register all MCP tools
register_all_tools(server);

// Connect using stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
