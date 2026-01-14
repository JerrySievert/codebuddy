'use strict';

import { get_nodes_from_source } from '../../lib/functions.mjs';
import { import_file } from '../../lib/sourcecode.mjs';
import { build_control_flow_from_source } from '../../lib/controlflow.mjs';

import { test } from 'st';

await test('Swift: parses function definitions', async (t) => {
  const source = await import_file('./tests/fixtures/test.swift');
  const nodes = get_nodes_from_source(source, 'test.swift');

  t.assert.ok(nodes.function_definition.length > 0, 'Should find function definitions');

  const funcNames = nodes.function_definition.map(f => f.content.substring(0, 50));
  t.assert.ok(funcNames.some(n => n.includes('greet')), 'Should find greet function');
  t.assert.ok(funcNames.some(n => n.includes('add')), 'Should find add function');
  t.assert.ok(funcNames.some(n => n.includes('factorial')), 'Should find factorial function');
});

await test('Swift: parses class methods', async (t) => {
  const source = await import_file('./tests/fixtures/test.swift');
  const nodes = get_nodes_from_source(source, 'test.swift');

  const funcContents = nodes.function_definition.map(f => f.content);
  t.assert.ok(funcContents.some(c => c.includes('func add') || c.includes('func subtract')), 'Should find class methods');
});

await test('Swift: extracts call expressions', async (t) => {
  const source = await import_file('./tests/fixtures/test.swift');
  const nodes = get_nodes_from_source(source, 'test.swift');

  t.assert.ok(nodes.call_expression.length > 0, 'Should find call expressions');
});

await test('Swift: extracts comments', async (t) => {
  const source = await import_file('./tests/fixtures/test.swift');
  const nodes = get_nodes_from_source(source, 'test.swift');

  t.assert.ok(nodes.comment.length > 0, 'Should find comments');
});

await test('Swift: extracts parameters', async (t) => {
  const source = await import_file('./tests/fixtures/test.swift');
  const nodes = get_nodes_from_source(source, 'test.swift');

  t.assert.ok(nodes.parameter_list.length > 0, 'Should find parameter lists');
});

await test('Swift: builds control flow graph for function with if', async (t) => {
  const source = `
func factorial(n: Int) -> Int {
    if n <= 1 {
        return 1
    } else {
        return n * factorial(n: n - 1)
    }
}
`;
  const cfg = build_control_flow_from_source(source, 'swift', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');
  t.assert.ok(cfg.edges.length > 0, 'Should have edges');

  const decisionNodes = cfg.nodes.filter(n => n.type === 'decision');
  t.assert.ok(decisionNodes.length > 0, 'Should have decision node for if');
});

await test('Swift: builds control flow graph for function with guard', async (t) => {
  const source = `
func divide(a: Int, b: Int) -> Int? {
    guard b != 0 else {
        return nil
    }
    return a / b
}
`;
  const cfg = build_control_flow_from_source(source, 'swift', 2, 7);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const decisionNodes = cfg.nodes.filter(n => n.type === 'decision');
  t.assert.ok(decisionNodes.length > 0, 'Should have decision node for guard');
});

await test('Swift: builds control flow graph for function with for-in loop', async (t) => {
  const source = `
func sumToN(n: Int) -> Int {
    var sum = 0
    for i in 1...n {
        sum += i
    }
    return sum
}
`;
  const cfg = build_control_flow_from_source(source, 'swift', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const loopNodes = cfg.nodes.filter(n => n.type === 'loop');
  t.assert.ok(loopNodes.length > 0, 'Should have loop node for for-in loop');
});

await test('Swift: builds control flow graph for function with switch', async (t) => {
  const source = `
func describe(n: Int) -> String {
    switch n {
    case 0:
        return "zero"
    case 1...9:
        return "small"
    default:
        return "large"
    }
}
`;
  const cfg = build_control_flow_from_source(source, 'swift', 2, 11);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const decisionNodes = cfg.nodes.filter(n => n.type === 'decision');
  t.assert.ok(decisionNodes.length > 0, 'Should have decision node for switch');
});
