'use strict';

/**
 * @fileoverview Tests for MCP tools registration.
 * Tests that the MCP server registers all expected tools.
 * Tool functionality is tested via the HTTP transport in mcp_http.mjs.
 */

import { createMcpServer } from '../../lib/mcp-http.mjs';
import { test } from 'st';

// Helper to get registered tool names from the server's internal registry
const getToolNames = (server) => {
  // Access the internal _registeredTools map
  const tools = server._registeredTools;
  return Object.keys(tools);
};

// ============ MCP Server Creation Tests ============

await test('createMcpServer creates server with all expected tools', async (t) => {
  const server = createMcpServer();
  const toolNames = getToolNames(server);

  // Check that all new tools are registered
  const expectedNewTools = [
    'entity_list',
    'entity_search',
    'entity_references',
    'class_members',
    'function_call_graph',
    'function_control_flow',
    'analysis_dashboard',
    'analysis_dead_code',
    'analysis_duplication',
    'analysis_dependencies',
    'analysis_security',
    'analysis_metrics',
    'analysis_code_smells',
    'analysis_types',
    'analysis_api_surface',
    'analysis_documentation',
    'analysis_scope',
    // Cross-reference tools
    'symbol_references',
    'go_to_definition',
    'list_definitions',
    'symbol_reference_summary',
    'symbols_at_location',
    // Class hierarchy tools
    'class_hierarchy',
    'interface_implementations',
    'analysis_hierarchy',
    // Concurrency and resource analysis tools
    'analysis_concurrency',
    'analysis_resources',
    // Naming and readability analysis tools
    'analysis_naming',
    'analysis_readability'
  ];

  for (const toolName of expectedNewTools) {
    t.assert.eq(toolNames.includes(toolName), true, `Should have tool '${toolName}'`);
  }
});

await test('createMcpServer creates server with original tools', async (t) => {
  const server = createMcpServer();
  const toolNames = getToolNames(server);

  // Check that original tools are still present
  const originalTools = [
    'function_list',
    'function_search',
    'function_retrieve',
    'function_callers',
    'function_callees',
    'project_list',
    'project_info',
    'project_import',
    'project_refresh',
    'project_delete',
    'read_sourcecode',
    'function_caller_tree',
    'function_callee_tree'
  ];

  for (const toolName of originalTools) {
    t.assert.eq(toolNames.includes(toolName), true, `Should have original tool '${toolName}'`);
  }
});
