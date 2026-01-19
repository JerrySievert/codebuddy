'use strict';

/**
 * @fileoverview Tests for strings.mjs (tool definitions).
 * Verifies the structure and content of MCP tool definitions.
 */

import { test } from 'st';
import { tools } from '../../lib/strings.mjs';

// ============ tools object structure tests ============

await test('tools object exists and has expected tools', (t) => {
  t.assert.ok(tools, 'tools object should exist');
  t.assert.ok(typeof tools === 'object', 'tools should be an object');
});

await test('tools contains function_list', (t) => {
  t.assert.ok(tools.function_list, 'Should have function_list');
  t.assert.eq(
    tools.function_list.name,
    'function_list',
    'function_list should have correct name'
  );
  t.assert.ok(
    tools.function_list.description,
    'function_list should have description'
  );
  t.assert.ok(
    tools.function_list.description.includes('function'),
    'function_list description should mention function'
  );
});

await test('tools contains function_search', (t) => {
  t.assert.ok(tools.function_search, 'Should have function_search');
  t.assert.eq(
    tools.function_search.name,
    'function_search',
    'function_search should have correct name'
  );
  t.assert.ok(
    tools.function_search.description,
    'function_search should have description'
  );
  t.assert.ok(
    tools.function_search.description.includes('search'),
    'function_search description should mention search'
  );
});

await test('tools contains function_retrieve', (t) => {
  t.assert.ok(tools.function_retrieve, 'Should have function_retrieve');
  t.assert.eq(
    tools.function_retrieve.name,
    'function_retrieve',
    'function_retrieve should have correct name'
  );
  t.assert.ok(
    tools.function_retrieve.description,
    'function_retrieve should have description'
  );
});

await test('tools contains generate_call_tree', (t) => {
  t.assert.ok(tools.generate_call_tree, 'Should have generate_call_tree');
  t.assert.eq(
    tools.generate_call_tree.name,
    'generate_call_tree',
    'generate_call_tree should have correct name'
  );
  t.assert.ok(
    tools.generate_call_tree.description,
    'generate_call_tree should have description'
  );
  t.assert.ok(
    tools.generate_call_tree.description.includes('call tree'),
    'generate_call_tree description should mention call tree'
  );
});

await test('tools contains function_callees', (t) => {
  t.assert.ok(tools.function_callees, 'Should have function_callees');
  t.assert.eq(
    tools.function_callees.name,
    'function_callees',
    'function_callees should have correct name'
  );
  t.assert.ok(
    tools.function_callees.description,
    'function_callees should have description'
  );
});

await test('tools contains function_callers', (t) => {
  t.assert.ok(tools.function_callers, 'Should have function_callers');
  t.assert.eq(
    tools.function_callers.name,
    'function_callers',
    'function_callers should have correct name'
  );
  t.assert.ok(
    tools.function_callers.description,
    'function_callers should have description'
  );
});

await test('tools contains project_list', (t) => {
  t.assert.ok(tools.project_list, 'Should have project_list');
  t.assert.eq(
    tools.project_list.name,
    'project_list',
    'project_list should have correct name'
  );
  t.assert.ok(
    tools.project_list.description,
    'project_list should have description'
  );
  t.assert.ok(
    tools.project_list.description.includes('project'),
    'project_list description should mention project'
  );
});

await test('tools contains project_info', (t) => {
  t.assert.ok(tools.project_info, 'Should have project_info');
  t.assert.eq(
    tools.project_info.name,
    'project_info',
    'project_info should have correct name'
  );
  t.assert.ok(
    tools.project_info.description,
    'project_info should have description'
  );
  t.assert.ok(tools.project_info.parameters, 'project_info should have parameters');
  t.assert.ok(tools.project_info.response, 'project_info should have response schema');
});

await test('tools contains read_sourcecode', (t) => {
  t.assert.ok(tools.read_sourcecode, 'Should have read_sourcecode');
  t.assert.eq(
    tools.read_sourcecode.name,
    'read_sourcecode',
    'read_sourcecode should have correct name'
  );
  t.assert.ok(
    tools.read_sourcecode.description,
    'read_sourcecode should have description'
  );
  t.assert.ok(
    tools.read_sourcecode.description.includes('source code'),
    'read_sourcecode description should mention source code'
  );
});

await test('tools contains function_caller_tree', (t) => {
  t.assert.ok(tools.function_caller_tree, 'Should have function_caller_tree');
  t.assert.eq(
    tools.function_caller_tree.name,
    'function_caller_tree',
    'function_caller_tree should have correct name'
  );
  t.assert.ok(
    tools.function_caller_tree.description,
    'function_caller_tree should have description'
  );
  t.assert.ok(
    tools.function_caller_tree.description.includes('depth'),
    'function_caller_tree description should mention depth parameter'
  );
});

await test('tools contains function_callee_tree', (t) => {
  t.assert.ok(tools.function_callee_tree, 'Should have function_callee_tree');
  t.assert.eq(
    tools.function_callee_tree.name,
    'function_callee_tree',
    'function_callee_tree should have correct name'
  );
  t.assert.ok(
    tools.function_callee_tree.description,
    'function_callee_tree should have description'
  );
  t.assert.ok(
    tools.function_callee_tree.description.includes('depth'),
    'function_callee_tree description should mention depth parameter'
  );
});

await test('tools contains entity_references', (t) => {
  t.assert.ok(tools.entity_references, 'Should have entity_references');
  t.assert.eq(
    tools.entity_references.name,
    'entity_references',
    'entity_references should have correct name'
  );
  t.assert.ok(
    tools.entity_references.description,
    'entity_references should have description'
  );
  t.assert.ok(
    tools.entity_references.description.includes('struct') ||
      tools.entity_references.description.includes('class'),
    'entity_references description should mention struct or class'
  );
});

// ============ JSON schema validation tests ============

await test('function_list description contains valid JSON schema hint', (t) => {
  const desc = tools.function_list.description;
  t.assert.ok(
    desc.includes('$schema'),
    'Should contain JSON schema reference'
  );
  t.assert.ok(desc.includes('properties'), 'Should contain properties');
  t.assert.ok(desc.includes('required'), 'Should contain required fields');
});

await test('project_list description contains valid JSON schema hint', (t) => {
  const desc = tools.project_list.description;
  t.assert.ok(
    desc.includes('$schema'),
    'Should contain JSON schema reference'
  );
  t.assert.ok(desc.includes('name'), 'Should mention name property');
  t.assert.ok(desc.includes('path'), 'Should mention path property');
  t.assert.ok(desc.includes('file_count'), 'Should mention file_count property');
  t.assert.ok(desc.includes('entity_count'), 'Should mention entity_count property');
});

await test('generate_call_tree description contains tree structure info', (t) => {
  const desc = tools.generate_call_tree.description;
  t.assert.ok(desc.includes('node'), 'Should mention node in tree');
  t.assert.ok(desc.includes('children'), 'Should mention children in tree');
  t.assert.ok(desc.includes('loop'), 'Should mention loop detection');
});

await test('entity_references description contains reference types', (t) => {
  const desc = tools.entity_references.description;
  t.assert.ok(desc.includes('variable'), 'Should mention variable reference type');
  t.assert.ok(desc.includes('parameter'), 'Should mention parameter reference type');
  t.assert.ok(desc.includes('field'), 'Should mention field reference type');
});

// ============ tool count test ============

await test('tools object has expected number of tools', (t) => {
  const tool_count = Object.keys(tools).length;
  t.assert.ok(tool_count >= 12, `Should have at least 12 tools, got ${tool_count}`);
});

// ============ all tools have required fields ============

await test('all tools have name and description', (t) => {
  for (const [key, tool] of Object.entries(tools)) {
    t.assert.ok(tool.name, `${key} should have name`);
    t.assert.ok(tool.description, `${key} should have description`);
    t.assert.ok(
      typeof tool.description === 'string',
      `${key} description should be a string`
    );
    t.assert.ok(
      tool.description.length > 10,
      `${key} description should be meaningful (>10 chars)`
    );
  }
});
