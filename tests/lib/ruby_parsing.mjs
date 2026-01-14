'use strict';

import { get_nodes_from_source } from '../../lib/functions.mjs';
import { import_file } from '../../lib/sourcecode.mjs';
import { build_control_flow_from_source } from '../../lib/controlflow.mjs';

import { test } from 'st';

await test('Ruby: parses method definitions', async (t) => {
  const source = await import_file('./tests/fixtures/test.rb');
  const nodes = get_nodes_from_source(source, 'test.rb');

  t.assert.ok(nodes.function_definition.length > 0, 'Should find method definitions');

  const funcNames = nodes.function_definition.map(f => f.content.substring(0, 50));
  t.assert.ok(funcNames.some(n => n.includes('greet')), 'Should find greet method');
  t.assert.ok(funcNames.some(n => n.includes('add')), 'Should find add method');
  t.assert.ok(funcNames.some(n => n.includes('factorial')), 'Should find factorial method');
});

await test('Ruby: parses class methods', async (t) => {
  const source = await import_file('./tests/fixtures/test.rb');
  const nodes = get_nodes_from_source(source, 'test.rb');

  const funcContents = nodes.function_definition.map(f => f.content);
  t.assert.ok(funcContents.some(c => c.includes('def add') || c.includes('def subtract')), 'Should find instance methods');
});

await test('Ruby: parses singleton methods', async (t) => {
  const source = await import_file('./tests/fixtures/test.rb');
  const nodes = get_nodes_from_source(source, 'test.rb');

  const singletonMethods = nodes.function_definition.filter(f => f.type === 'singleton_method');
  t.assert.ok(singletonMethods.length > 0, 'Should find singleton methods');
});

await test('Ruby: extracts call expressions', async (t) => {
  const source = await import_file('./tests/fixtures/test.rb');
  const nodes = get_nodes_from_source(source, 'test.rb');

  t.assert.ok(nodes.call_expression.length > 0, 'Should find call expressions');
});

await test('Ruby: extracts comments', async (t) => {
  const source = await import_file('./tests/fixtures/test.rb');
  const nodes = get_nodes_from_source(source, 'test.rb');

  t.assert.ok(nodes.comment.length > 0, 'Should find comments');
});

await test('Ruby: extracts parameters', async (t) => {
  const source = await import_file('./tests/fixtures/test.rb');
  const nodes = get_nodes_from_source(source, 'test.rb');

  t.assert.ok(nodes.parameter_list.length > 0, 'Should find parameter lists');
});

await test('Ruby: builds control flow graph for method with if', async (t) => {
  const source = `
def factorial(n)
  if n <= 1
    1
  else
    n * factorial(n - 1)
  end
end
`;
  const cfg = build_control_flow_from_source(source, 'ruby', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');
  t.assert.ok(cfg.edges.length > 0, 'Should have edges');

  const decisionNodes = cfg.nodes.filter(n => n.type === 'decision');
  t.assert.ok(decisionNodes.length > 0, 'Should have decision node for if');
});

await test('Ruby: builds control flow graph for method with unless', async (t) => {
  const source = `
def safe_divide(a, b)
  return nil unless b != 0
  a / b
end
`;
  const cfg = build_control_flow_from_source(source, 'ruby', 2, 5);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const decisionNodes = cfg.nodes.filter(n => n.type === 'decision');
  t.assert.ok(decisionNodes.length > 0, 'Should have decision node for unless');
});

await test('Ruby: builds control flow graph for method with while loop', async (t) => {
  const source = `
def count_digits(number)
  n = number.abs
  count = 0
  while n > 0
    count += 1
    n /= 10
  end
  count
end
`;
  const cfg = build_control_flow_from_source(source, 'ruby', 2, 10);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const loopNodes = cfg.nodes.filter(n => n.type === 'loop');
  t.assert.ok(loopNodes.length > 0, 'Should have loop node for while loop');
});

await test('Ruby: builds control flow graph for method with case/when', async (t) => {
  const source = `
def describe_number(n)
  case n
  when 0
    "zero"
  when 1..9
    "small"
  else
    "large"
  end
end
`;
  const cfg = build_control_flow_from_source(source, 'ruby', 2, 11);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const decisionNodes = cfg.nodes.filter(n => n.type === 'decision');
  t.assert.ok(decisionNodes.length > 0, 'Should have decision node for case');
});

await test('Ruby: builds control flow graph for method with begin/rescue', async (t) => {
  const source = `
def read_file(path)
  begin
    File.read(path)
  rescue => e
    nil
  end
end
`;
  const cfg = build_control_flow_from_source(source, 'ruby', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');
});
