'use strict';

import { get_nodes_from_source } from '../../lib/functions.mjs';
import { import_file } from '../../lib/sourcecode.mjs';
import { build_control_flow_from_source } from '../../lib/controlflow.mjs';

import { test } from 'st';

await test('Zig: parses function definitions', async (t) => {
  const source = await import_file('./tests/fixtures/test.zig');
  const nodes = get_nodes_from_source(source, 'test.zig');

  t.assert.ok(nodes.fn_decl.length > 0, 'Should find function definitions');

  const funcNames = nodes.fn_decl.map(f => f.content.substring(0, 50));
  t.assert.ok(funcNames.some(n => n.includes('add')), 'Should find add function');
  t.assert.ok(funcNames.some(n => n.includes('simple_function')), 'Should find simple_function');
  t.assert.ok(funcNames.some(n => n.includes('main')), 'Should find main function');
});

await test('Zig: parses function calls', async (t) => {
  const source = await import_file('./tests/fixtures/test.zig');
  const nodes = get_nodes_from_source(source, 'test.zig');

  t.assert.ok(nodes.call_expression.length > 0, 'Should find function calls');
});

await test('Zig: extracts control flow - conditionals', async (t) => {
  const source = await import_file('./tests/fixtures/test.zig');
  const result = build_control_flow_from_source(source, 'zig', 'process_value');

  t.assert.ok(result.nodes.length > 0, 'Should find control flow nodes');

  const conditionalNodes = result.nodes.filter(n => n.type === 'conditional');
  t.assert.ok(conditionalNodes.length > 0, 'Should find conditional nodes');
});

await test('Zig: extracts control flow - loops', async (t) => {
  const source = await import_file('./tests/fixtures/test.zig');
  const result = build_control_flow_from_source(source, 'zig', 'sum_array');

  t.assert.ok(result.nodes.length > 0, 'Should find control flow nodes');

  const loopNodes = result.nodes.filter(n => n.type === 'loop');
  t.assert.ok(loopNodes.length > 0, 'Should find loop nodes');
});

await test('Zig: extracts control flow - switch', async (t) => {
  const source = await import_file('./tests/fixtures/test.zig');
  const result = build_control_flow_from_source(source, 'zig', 'get_message');

  t.assert.ok(result.nodes.length > 0, 'Should find control flow nodes');

  const switchNodes = result.nodes.filter(n => n.type === 'switch');
  t.assert.ok(switchNodes.length > 0, 'Should find switch nodes');
});
