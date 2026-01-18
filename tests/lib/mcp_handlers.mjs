'use strict';

/**
 * @fileoverview Tests for MCP tool handlers.
 * Tests the handler functions directly without MCP protocol overhead.
 */

import { test } from 'st';

// Import handlers from tool modules
import {
  project_list_handler,
  project_info_handler,
  project_tools
} from '../../lib/mcp/tools/project.mjs';

import {
  function_list_handler,
  function_search_handler,
  function_retrieve_handler,
  function_callers_handler,
  function_callees_handler,
  function_caller_tree_handler,
  function_callee_tree_handler,
  function_callgraph_handler,
  function_complexity_handler,
  function_controlflow_handler,
  function_tools
} from '../../lib/mcp/tools/function.mjs';

import {
  entity_list_handler,
  entity_search_handler,
  entity_references_handler,
  class_members_handler,
  entity_tools
} from '../../lib/mcp/tools/entity.mjs';

import {
  read_sourcecode_handler,
  file_analytics_handler,
  sourcecode_tools
} from '../../lib/mcp/tools/sourcecode.mjs';

import {
  analysis_dashboard_handler,
  analysis_dead_code_handler,
  analysis_duplication_handler,
  analysis_dependencies_handler,
  analysis_security_handler,
  analysis_metrics_handler,
  analysis_code_smells_handler,
  analysis_types_handler,
  analysis_api_surface_handler,
  analysis_documentation_handler,
  analysis_scope_handler,
  analysis_concurrency_handler,
  analysis_resources_handler,
  analysis_naming_handler,
  analysis_readability_handler,
  analysis_patterns_handler,
  analysis_tests_handler,
  analysis_tools
} from '../../lib/mcp/tools/analysis.mjs';

import {
  symbol_references_handler,
  go_to_definition_handler,
  list_definitions_handler,
  symbol_reference_summary_handler,
  symbols_at_location_handler,
  reference_tools
} from '../../lib/mcp/tools/reference.mjs';

import {
  class_hierarchy_handler,
  interface_implementations_handler,
  analysis_hierarchy_handler,
  hierarchy_tools
} from '../../lib/mcp/tools/hierarchy.mjs';

import {
  all_tools,
  register_all_tools,
  get_tool_names,
  get_tool_by_name
} from '../../lib/mcp/tools.mjs';

// =============================================================================
// Tool Registration Tests
// =============================================================================

await test('all_tools contains expected number of tools', async (t) => {
  // Count tools from each module
  const expected_count =
    project_tools.length +
    function_tools.length +
    entity_tools.length +
    sourcecode_tools.length +
    analysis_tools.length +
    reference_tools.length +
    hierarchy_tools.length;

  t.assert.eq(
    all_tools.length,
    expected_count,
    `Should have ${expected_count} tools total`
  );
});

await test('get_tool_names returns all tool names', async (t) => {
  const names = get_tool_names();

  t.assert.eq(Array.isArray(names), true, 'Should return an array');
  t.assert.eq(names.length, all_tools.length, 'Should have same length as all_tools');

  // Check some expected tool names
  t.assert.eq(names.includes('project_list'), true, 'Should include project_list');
  t.assert.eq(names.includes('function_search'), true, 'Should include function_search');
  t.assert.eq(names.includes('analysis_dashboard'), true, 'Should include analysis_dashboard');
});

await test('get_tool_by_name returns correct tool', async (t) => {
  const tool = get_tool_by_name('project_list');

  t.assert.eq(tool !== undefined, true, 'Should find project_list tool');
  t.assert.eq(tool.name, 'project_list', 'Should have correct name');
  t.assert.eq(typeof tool.handler, 'function', 'Should have handler function');
  t.assert.eq(typeof tool.description, 'string', 'Should have description');
});

await test('get_tool_by_name returns undefined for unknown tool', async (t) => {
  const tool = get_tool_by_name('unknown_tool_xyz');

  t.assert.eq(tool, undefined, 'Should return undefined for unknown tool');
});

// =============================================================================
// Tool Definition Tests
// =============================================================================

await test('project_tools has correct structure', async (t) => {
  for (const tool of project_tools) {
    t.assert.eq(typeof tool.name, 'string', `Tool should have name`);
    t.assert.eq(typeof tool.description, 'string', `Tool ${tool.name} should have description`);
    t.assert.eq(typeof tool.schema, 'object', `Tool ${tool.name} should have schema`);
    t.assert.eq(typeof tool.handler, 'function', `Tool ${tool.name} should have handler`);
  }
});

await test('function_tools has correct structure', async (t) => {
  for (const tool of function_tools) {
    t.assert.eq(typeof tool.name, 'string', `Tool should have name`);
    t.assert.eq(typeof tool.description, 'string', `Tool ${tool.name} should have description`);
    t.assert.eq(typeof tool.schema, 'object', `Tool ${tool.name} should have schema`);
    t.assert.eq(typeof tool.handler, 'function', `Tool ${tool.name} should have handler`);
  }
});

await test('entity_tools has correct structure', async (t) => {
  for (const tool of entity_tools) {
    t.assert.eq(typeof tool.name, 'string', `Tool should have name`);
    t.assert.eq(typeof tool.description, 'string', `Tool ${tool.name} should have description`);
    t.assert.eq(typeof tool.schema, 'object', `Tool ${tool.name} should have schema`);
    t.assert.eq(typeof tool.handler, 'function', `Tool ${tool.name} should have handler`);
  }
});

await test('analysis_tools has correct structure', async (t) => {
  for (const tool of analysis_tools) {
    t.assert.eq(typeof tool.name, 'string', `Tool should have name`);
    t.assert.eq(typeof tool.description, 'string', `Tool ${tool.name} should have description`);
    t.assert.eq(typeof tool.schema, 'object', `Tool ${tool.name} should have schema`);
    t.assert.eq(typeof tool.handler, 'function', `Tool ${tool.name} should have handler`);
  }
});

await test('reference_tools has correct structure', async (t) => {
  for (const tool of reference_tools) {
    t.assert.eq(typeof tool.name, 'string', `Tool should have name`);
    t.assert.eq(typeof tool.description, 'string', `Tool ${tool.name} should have description`);
    t.assert.eq(typeof tool.schema, 'object', `Tool ${tool.name} should have schema`);
    t.assert.eq(typeof tool.handler, 'function', `Tool ${tool.name} should have handler`);
  }
});

await test('hierarchy_tools has correct structure', async (t) => {
  for (const tool of hierarchy_tools) {
    t.assert.eq(typeof tool.name, 'string', `Tool should have name`);
    t.assert.eq(typeof tool.description, 'string', `Tool ${tool.name} should have description`);
    t.assert.eq(typeof tool.schema, 'object', `Tool ${tool.name} should have schema`);
    t.assert.eq(typeof tool.handler, 'function', `Tool ${tool.name} should have handler`);
  }
});

// =============================================================================
// Project Handler Tests
// =============================================================================

await test('project_list_handler returns content array', async (t) => {
  const result = await project_list_handler();

  t.assert.eq(typeof result, 'object', 'Should return an object');
  t.assert.eq(Array.isArray(result.content), true, 'Should have content array');
  t.assert.eq(result.isError, undefined, 'Should not be an error');
});

await test('project_info_handler throws for non-existent project', async (t) => {
  try {
    await project_info_handler({ name: 'non_existent_project_xyz_123' });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

// =============================================================================
// Function Handler Tests
// =============================================================================

await test('function_list_handler throws for non-existent project', async (t) => {
  try {
    await function_list_handler({ project: 'non_existent_project_xyz_123' });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('function_search_handler throws when function not found', async (t) => {
  try {
    await function_search_handler({ name: 'non_existent_function_xyz_123' });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('function_caller_tree_handler throws for non-existent project', async (t) => {
  try {
    await function_caller_tree_handler({
      name: 'some_function',
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('function_callee_tree_handler throws for non-existent project', async (t) => {
  try {
    await function_callee_tree_handler({
      name: 'some_function',
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('function_controlflow_handler throws for non-existent project', async (t) => {
  try {
    await function_controlflow_handler({
      name: 'some_function',
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

// =============================================================================
// Entity Handler Tests
// =============================================================================

await test('entity_list_handler throws for non-existent project', async (t) => {
  try {
    await entity_list_handler({ project: 'non_existent_project_xyz_123' });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('entity_search_handler returns results even with no project', async (t) => {
  // entity_search with no project should return empty results, not throw
  const result = await entity_search_handler({
    name: 'non_existent_entity_xyz_123'
  });

  t.assert.eq(typeof result, 'object', 'Should return an object');
  t.assert.eq(Array.isArray(result.content), true, 'Should have content array');
});

await test('entity_references_handler throws for non-existent project', async (t) => {
  try {
    await entity_references_handler({
      name: 'SomeStruct',
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('class_members_handler throws for non-existent entity', async (t) => {
  try {
    await class_members_handler({ id: 999999999 });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

// =============================================================================
// Analysis Handler Tests
// =============================================================================

await test('analysis_dashboard_handler throws for non-existent project', async (t) => {
  try {
    await analysis_dashboard_handler({
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('analysis_dead_code_handler throws for non-existent project', async (t) => {
  try {
    await analysis_dead_code_handler({
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('analysis_duplication_handler throws for non-existent project', async (t) => {
  try {
    await analysis_duplication_handler({
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('analysis_security_handler throws for non-existent project', async (t) => {
  try {
    await analysis_security_handler({
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('analysis_metrics_handler throws for non-existent project', async (t) => {
  try {
    await analysis_metrics_handler({
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

// =============================================================================
// Reference Handler Tests
// =============================================================================

await test('symbol_references_handler throws for non-existent project', async (t) => {
  try {
    await symbol_references_handler({
      project: 'non_existent_project_xyz_123',
      symbol: 'someSymbol'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('go_to_definition_handler throws for non-existent project', async (t) => {
  try {
    await go_to_definition_handler({
      project: 'non_existent_project_xyz_123',
      symbol: 'someSymbol'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('list_definitions_handler throws for non-existent project', async (t) => {
  try {
    await list_definitions_handler({
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('symbol_reference_summary_handler throws for non-existent project', async (t) => {
  try {
    await symbol_reference_summary_handler({
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('symbols_at_location_handler throws for non-existent project', async (t) => {
  try {
    await symbols_at_location_handler({
      project: 'non_existent_project_xyz_123',
      filename: 'test.js',
      line: 1
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

// =============================================================================
// Hierarchy Handler Tests
// =============================================================================

await test('class_hierarchy_handler throws for non-existent project', async (t) => {
  try {
    await class_hierarchy_handler({
      project: 'non_existent_project_xyz_123',
      symbol: 'SomeClass'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('interface_implementations_handler throws for non-existent project', async (t) => {
  try {
    await interface_implementations_handler({
      project: 'non_existent_project_xyz_123',
      symbol: 'SomeInterface'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

await test('analysis_hierarchy_handler throws for non-existent project', async (t) => {
  try {
    await analysis_hierarchy_handler({
      project: 'non_existent_project_xyz_123'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

// =============================================================================
// Sourcecode Handler Tests
// =============================================================================

await test('file_analytics_handler throws for non-existent project', async (t) => {
  try {
    await file_analytics_handler({
      project: 'non_existent_project_xyz_123',
      filename: 'test.js'
    });
    t.assert.eq(true, false, 'Should have thrown an error');
  } catch (err) {
    t.assert.eq(
      err.message.includes('not found'),
      true,
      'Error should mention not found'
    );
  }
});

// =============================================================================
// Tool Count Verification Tests
// =============================================================================

await test('project_tools has expected tools', async (t) => {
  const expected = [
    'project_list',
    'project_info',
    'project_import',
    'project_refresh',
    'project_delete'
  ];

  for (const name of expected) {
    const tool = project_tools.find((t) => t.name === name);
    t.assert.eq(tool !== undefined, true, `Should have tool '${name}'`);
  }

  t.assert.eq(
    project_tools.length,
    expected.length,
    `Should have ${expected.length} project tools`
  );
});

await test('function_tools has expected tools', async (t) => {
  const expected = [
    'function_list',
    'function_search',
    'function_retrieve',
    'function_callers',
    'function_callees',
    'function_caller_tree',
    'function_callee_tree',
    'function_callgraph',
    'function_complexity',
    'function_controlflow'
  ];

  for (const name of expected) {
    const tool = function_tools.find((t) => t.name === name);
    t.assert.eq(tool !== undefined, true, `Should have tool '${name}'`);
  }

  t.assert.eq(
    function_tools.length,
    expected.length,
    `Should have ${expected.length} function tools`
  );
});

await test('entity_tools has expected tools', async (t) => {
  const expected = [
    'entity_list',
    'entity_search',
    'entity_references',
    'class_members'
  ];

  for (const name of expected) {
    const tool = entity_tools.find((t) => t.name === name);
    t.assert.eq(tool !== undefined, true, `Should have tool '${name}'`);
  }

  t.assert.eq(
    entity_tools.length,
    expected.length,
    `Should have ${expected.length} entity tools`
  );
});

await test('analysis_tools has expected tools', async (t) => {
  const expected = [
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
    'analysis_concurrency',
    'analysis_resources',
    'analysis_naming',
    'analysis_readability',
    'analysis_patterns',
    'analysis_tests'
  ];

  for (const name of expected) {
    const tool = analysis_tools.find((t) => t.name === name);
    t.assert.eq(tool !== undefined, true, `Should have tool '${name}'`);
  }

  t.assert.eq(
    analysis_tools.length,
    expected.length,
    `Should have ${expected.length} analysis tools`
  );
});

await test('reference_tools has expected tools', async (t) => {
  const expected = [
    'symbol_references',
    'go_to_definition',
    'list_definitions',
    'symbol_reference_summary',
    'symbols_at_location'
  ];

  for (const name of expected) {
    const tool = reference_tools.find((t) => t.name === name);
    t.assert.eq(tool !== undefined, true, `Should have tool '${name}'`);
  }

  t.assert.eq(
    reference_tools.length,
    expected.length,
    `Should have ${expected.length} reference tools`
  );
});

await test('hierarchy_tools has expected tools', async (t) => {
  const expected = [
    'class_hierarchy',
    'interface_implementations',
    'analysis_hierarchy'
  ];

  for (const name of expected) {
    const tool = hierarchy_tools.find((t) => t.name === name);
    t.assert.eq(tool !== undefined, true, `Should have tool '${name}'`);
  }

  t.assert.eq(
    hierarchy_tools.length,
    expected.length,
    `Should have ${expected.length} hierarchy tools`
  );
});

await test('sourcecode_tools has expected tools', async (t) => {
  const expected = ['read_sourcecode', 'file_analytics'];

  for (const name of expected) {
    const tool = sourcecode_tools.find((t) => t.name === name);
    t.assert.eq(tool !== undefined, true, `Should have tool '${name}'`);
  }

  t.assert.eq(
    sourcecode_tools.length,
    expected.length,
    `Should have ${expected.length} sourcecode tools`
  );
});
