'use strict';

/**
 * @fileoverview MCP tool registration module.
 * Provides functions to register all MCP tools on a server instance.
 * @module lib/mcp/tools
 */

import { project_tools } from './tools/project.mjs';
import { function_tools } from './tools/function.mjs';
import { entity_tools } from './tools/entity.mjs';
import { sourcecode_tools } from './tools/sourcecode.mjs';
import { analysis_tools } from './tools/analysis.mjs';
import { reference_tools } from './tools/reference.mjs';
import { hierarchy_tools } from './tools/hierarchy.mjs';

/**
 * All available MCP tools combined into a single array.
 */
export const all_tools = [
  ...project_tools,
  ...function_tools,
  ...entity_tools,
  ...sourcecode_tools,
  ...analysis_tools,
  ...reference_tools,
  ...hierarchy_tools
];

/**
 * Registers all MCP tools on a server instance.
 * Wraps each handler with error handling for consistent error responses.
 *
 * @param {McpServer} server - MCP server instance to register tools on
 */
export const register_all_tools = (server) => {
  for (const tool of all_tools) {
    server.tool(tool.name, tool.description, tool.schema, async (args) => {
      try {
        return await tool.handler(args);
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    });
  }
};

/**
 * Gets a list of all registered tool names.
 * @returns {string[]} Array of tool names
 */
export const get_tool_names = () => {
  return all_tools.map((tool) => tool.name);
};

/**
 * Gets a tool definition by name.
 * @param {string} name - Tool name
 * @returns {Object|undefined} Tool definition or undefined if not found
 */
export const get_tool_by_name = (name) => {
  return all_tools.find((tool) => tool.name === name);
};
