'use strict';

import { get_nodes_from_source } from '../../lib/functions.mjs';
import { import_file } from '../../lib/sourcecode.mjs';
import { build_control_flow_from_source } from '../../lib/controlflow.mjs';

import { test } from 'st';

await test('Go: parses function definitions', async (t) => {
  const source = await import_file('./tests/fixtures/test.go');
  const nodes = get_nodes_from_source(source, 'test.go');

  t.assert.ok(nodes.function_declaration.length > 0, 'Should find function declarations');

  const funcNames = nodes.function_declaration.map(f => f.content.substring(0, 50));
  t.assert.ok(funcNames.some(n => n.includes('SimpleFunction')), 'Should find SimpleFunction');
  t.assert.ok(funcNames.some(n => n.includes('Add')), 'Should find Add function');
  t.assert.ok(funcNames.some(n => n.includes('main')), 'Should find main function');
});

await test('Go: parses method declarations', async (t) => {
  const source = await import_file('./tests/fixtures/test.go');
  const nodes = get_nodes_from_source(source, 'test.go');

  t.assert.ok(nodes.method_declaration.length > 0, 'Should find method declarations');

  const methodNames = nodes.method_declaration.map(f => f.content.substring(0, 50));
  t.assert.ok(methodNames.some(n => n.includes('Add')), 'Should find Add method');
  t.assert.ok(methodNames.some(n => n.includes('Multiply')), 'Should find Multiply method');
});

await test('Go: parses function calls', async (t) => {
  const source = await import_file('./tests/fixtures/test.go');
  const nodes = get_nodes_from_source(source, 'test.go');

  t.assert.ok(nodes.call_expression.length > 0, 'Should find function calls');
});

await test('Go: extracts control flow - conditionals', async (t) => {
  const source = await import_file('./tests/fixtures/test.go');
  const result = build_control_flow_from_source(source, 'go', 'ProcessNumbers');

  t.assert.ok(result.nodes.length > 0, 'Should find control flow nodes');

  const conditionalNodes = result.nodes.filter(n => n.type === 'conditional');
  t.assert.ok(conditionalNodes.length > 0, 'Should find conditional nodes');
});

await test('Go: extracts control flow - loops', async (t) => {
  const source = await import_file('./tests/fixtures/test.go');
  const result = build_control_flow_from_source(source, 'go', 'ProcessNumbers');

  t.assert.ok(result.nodes.length > 0, 'Should find control flow nodes');

  const loopNodes = result.nodes.filter(n => n.type === 'loop');
  t.assert.ok(loopNodes.length > 0, 'Should find loop nodes');
});

await test('Go: extracts control flow - switch', async (t) => {
  const source = await import_file('./tests/fixtures/test.go');
  const result = build_control_flow_from_source(source, 'go', 'GetGrade');

  t.assert.ok(result.nodes.length > 0, 'Should find control flow nodes');

  const switchNodes = result.nodes.filter(n => n.type === 'switch');
  t.assert.ok(switchNodes.length > 0, 'Should find switch nodes');
});

await test('Go: extracts control flow - type switch', async (t) => {
  const source = await import_file('./tests/fixtures/test.go');
  const result = build_control_flow_from_source(source, 'go', 'TypeSwitch');

  t.assert.ok(result.nodes.length > 0, 'Should find control flow nodes');

  const switchNodes = result.nodes.filter(n => n.type === 'switch');
  t.assert.ok(switchNodes.length > 0, 'Should find type switch nodes');
});
