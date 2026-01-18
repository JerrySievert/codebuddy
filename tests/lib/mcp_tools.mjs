'use strict';

/**
 * @fileoverview Tests for MCP tools registration.
 * Tests that the MCP server registers all expected tools.
 * Tool functionality is tested in mcp_handlers.mjs.
 */

import { create_mcp_server } from '../../lib/mcp-http.mjs';
import { get_tool_names } from '../../lib/mcp/tools.mjs';
import { test } from 'st';

// Helper to get registered tool names from the server's internal registry
const get_server_tool_names = (server) => {
  // Access the internal _registeredTools map
  const tools = server._registeredTools;
  return Object.keys(tools);
};

// ============ MCP Server Creation Tests ============

await test('create_mcp_server creates server with all expected tools', async (t) => {
  const server = create_mcp_server();
  const server_tool_names = get_server_tool_names(server);

  // Check that all new tools are registered
  const expected_new_tools = [
    'entity_list',
    'entity_search',
    'entity_references',
    'class_members',
    'function_callgraph',
    'function_controlflow',
    'function_complexity',
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
    'analysis_readability',
    // Pattern detection and test analysis tools
    'analysis_patterns',
    'analysis_tests',
    // File analytics
    'file_analytics'
  ];

  for (const tool_name of expected_new_tools) {
    t.assert.eq(
      server_tool_names.includes(tool_name),
      true,
      `Should have tool '${tool_name}'`
    );
  }
});

await test('create_mcp_server creates server with original tools', async (t) => {
  const server = create_mcp_server();
  const server_tool_names = get_server_tool_names(server);

  // Check that original tools are still present
  const original_tools = [
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

  for (const tool_name of original_tools) {
    t.assert.eq(
      server_tool_names.includes(tool_name),
      true,
      `Should have original tool '${tool_name}'`
    );
  }
});

await test('registered tools match get_tool_names from tools module', async (t) => {
  const server = create_mcp_server();
  const server_tool_names = get_server_tool_names(server);
  const module_tool_names = get_tool_names();

  // Both should have the same tools
  t.assert.eq(
    server_tool_names.length,
    module_tool_names.length,
    'Should have same number of tools'
  );

  for (const name of module_tool_names) {
    t.assert.eq(
      server_tool_names.includes(name),
      true,
      `Server should have tool '${name}' from module`
    );
  }
});
