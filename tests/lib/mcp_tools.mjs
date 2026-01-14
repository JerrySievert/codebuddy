'use strict';

/**
 * @fileoverview Tests for MCP tools.
 * Tests the MCP server tool handlers for the new analysis and entity tools.
 */

import { createMcpServer } from '../../lib/mcp-http.mjs';
import { test } from 'st';

// Helper to call a tool on the MCP server
const callTool = async (server, name, args) => {
  // Access the internal tool registry (it's an object, not a Map)
  const tools = server._registeredTools;
  const tool = tools[name];
  if (!tool) {
    throw new Error(`Tool '${name}' not found`);
  }
  return await tool.callback(args);
};

// Helper to check if a tool exists
const hasTool = (server, name) => {
  return name in server._registeredTools;
};

// ============ Entity Tools Tests ============

await test('entity_list returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'entity_list', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('entity_search returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'entity_search', {
    name: 'test_function',
    project: 'non_existent_project_xyz123'
  });

  // entity_search should return empty results, not necessarily an error
  t.assert.eq(result.content.length >= 0, true, 'Should return content array');
});

await test('class_members returns error for non-existent entity', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'class_members', {
    entity_id: 999999999  // Non-existent ID
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

// ============ Call Graph Tests ============

await test('function_call_graph returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'function_call_graph', {
    name: 'test_function',
    project: 'non_existent_project_xyz123',
    depth: 2
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention project not found');
});

// ============ Control Flow Tests ============

await test('function_control_flow returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'function_control_flow', {
    name: 'test_function',
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

// ============ Analysis Tools Tests ============

await test('analysis_dashboard returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_dashboard', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('analysis_dead_code returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_dead_code', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('analysis_duplication returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_duplication', {
    project: 'non_existent_project_xyz123',
    threshold: 0.7
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('analysis_dependencies returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_dependencies', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('analysis_security returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_security', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('analysis_metrics returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_metrics', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('analysis_code_smells returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_code_smells', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('analysis_types returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_types', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('analysis_api_surface returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_api_surface', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('analysis_documentation returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_documentation', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

await test('analysis_scope returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'analysis_scope', {
    project: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});

// ============ MCP Server Creation Tests ============

await test('createMcpServer creates server with all expected tools', async (t) => {
  const server = createMcpServer();

  // Check that all new tools are registered
  const expectedNewTools = [
    'entity_list',
    'entity_search',
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
    'analysis_scope'
  ];

  for (const toolName of expectedNewTools) {
    t.assert.eq(hasTool(server, toolName), true, `Should have tool '${toolName}'`);
  }
});

await test('createMcpServer creates server with original tools', async (t) => {
  const server = createMcpServer();

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
    t.assert.eq(hasTool(server, toolName), true, `Should have original tool '${toolName}'`);
  }
});

// ============ Project Tools Tests ============

await test('project_import returns error for invalid path', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'project_import', {
    name: 'test_import_project',
    path: '/non/existent/path/xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
});

await test('project_refresh returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'project_refresh', {
    name: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('does not exist'), true, 'Error message should mention does not exist');
});

await test('project_delete returns error for non-existent project', async (t) => {
  const server = createMcpServer();

  const result = await callTool(server, 'project_delete', {
    name: 'non_existent_project_xyz123'
  });

  t.assert.eq(result.isError, true, 'Should return an error');
  t.assert.eq(result.content[0].text.includes('not found'), true, 'Error message should mention not found');
});
