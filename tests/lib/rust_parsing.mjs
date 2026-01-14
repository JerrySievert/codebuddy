'use strict';

import { get_nodes_from_source } from '../../lib/functions.mjs';
import { import_file } from '../../lib/sourcecode.mjs';
import { build_control_flow_from_source } from '../../lib/controlflow.mjs';

import { test } from 'st';

await test('Rust: parses function definitions', async (t) => {
  const source = await import_file('./tests/fixtures/test.rs');
  const nodes = get_nodes_from_source(source, 'test.rs');

  t.assert.ok(nodes.function_definition.length > 0, 'Should find function definitions');

  const funcNames = nodes.function_definition.map(f => f.content.substring(0, 50));
  t.assert.ok(funcNames.some(n => n.includes('greet')), 'Should find greet function');
  t.assert.ok(funcNames.some(n => n.includes('add')), 'Should find add function');
  t.assert.ok(funcNames.some(n => n.includes('factorial')), 'Should find factorial function');
});

await test('Rust: parses impl methods', async (t) => {
  const source = await import_file('./tests/fixtures/test.rs');
  const nodes = get_nodes_from_source(source, 'test.rs');

  const funcContents = nodes.function_definition.map(f => f.content);
  t.assert.ok(funcContents.some(c => c.includes('Calculator')), 'Should find Calculator impl methods');
});

await test('Rust: extracts call expressions', async (t) => {
  const source = await import_file('./tests/fixtures/test.rs');
  const nodes = get_nodes_from_source(source, 'test.rs');

  t.assert.ok(nodes.call_expression.length > 0, 'Should find call expressions');
});

await test('Rust: extracts comments', async (t) => {
  const source = await import_file('./tests/fixtures/test.rs');
  const nodes = get_nodes_from_source(source, 'test.rs');

  t.assert.ok(nodes.comment.length > 0, 'Should find comments');
});

await test('Rust: extracts parameters', async (t) => {
  const source = await import_file('./tests/fixtures/test.rs');
  const nodes = get_nodes_from_source(source, 'test.rs');

  t.assert.ok(nodes.parameter_list.length > 0, 'Should find parameter lists');
});

await test('Rust: builds control flow graph for function with if', async (t) => {
  const source = `
fn factorial(n: u64) -> u64 {
    if n <= 1 {
        1
    } else {
        n * factorial(n - 1)
    }
}
`;
  const cfg = build_control_flow_from_source(source, 'rust', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');
  t.assert.ok(cfg.edges.length > 0, 'Should have edges');

  const decisionNodes = cfg.nodes.filter(n => n.type === 'decision');
  t.assert.ok(decisionNodes.length > 0, 'Should have decision node for if');
});

await test('Rust: builds control flow graph for function with loop', async (t) => {
  const source = `
fn sum_to_n(n: i32) -> i32 {
    let mut sum = 0;
    for i in 1..=n {
        sum += i;
    }
    sum
}
`;
  const cfg = build_control_flow_from_source(source, 'rust', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const loopNodes = cfg.nodes.filter(n => n.type === 'loop');
  t.assert.ok(loopNodes.length > 0, 'Should have loop node for for loop');
});

await test('Rust: builds control flow graph for function with match', async (t) => {
  const source = `
fn describe(n: i32) -> &'static str {
    match n {
        0 => "zero",
        1..=9 => "small",
        _ => "large",
    }
}
`;
  const cfg = build_control_flow_from_source(source, 'rust', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const decisionNodes = cfg.nodes.filter(n => n.type === 'decision');
  t.assert.ok(decisionNodes.length > 0, 'Should have decision node for match');
});
