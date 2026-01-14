'use strict';

import { get_nodes_from_source } from '../../lib/functions.mjs';
import { import_file } from '../../lib/sourcecode.mjs';
import { build_control_flow_from_source } from '../../lib/controlflow.mjs';

import { test } from 'st';

await test('PHP: parses function definitions', async (t) => {
  const source = await import_file('./tests/fixtures/test.php');
  const nodes = get_nodes_from_source(source, 'test.php');

  t.assert.ok(nodes.function_definition.length > 0, 'Should find function definitions');

  const funcNames = nodes.function_definition.map(f => f.content.substring(0, 50));
  t.assert.ok(funcNames.some(n => n.includes('greet')), 'Should find greet function');
  t.assert.ok(funcNames.some(n => n.includes('add')), 'Should find add function');
  t.assert.ok(funcNames.some(n => n.includes('factorial')), 'Should find factorial function');
});

await test('PHP: parses class methods', async (t) => {
  const source = await import_file('./tests/fixtures/test.php');
  const nodes = get_nodes_from_source(source, 'test.php');

  const methodDefs = nodes.function_definition.filter(f => f.type === 'method_declaration');
  t.assert.ok(methodDefs.length > 0, 'Should find method declarations');
});

await test('PHP: extracts call expressions', async (t) => {
  const source = await import_file('./tests/fixtures/test.php');
  const nodes = get_nodes_from_source(source, 'test.php');

  t.assert.ok(nodes.call_expression.length > 0, 'Should find call expressions');
});

await test('PHP: extracts comments', async (t) => {
  const source = await import_file('./tests/fixtures/test.php');
  const nodes = get_nodes_from_source(source, 'test.php');

  t.assert.ok(nodes.comment.length > 0, 'Should find comments');
});

await test('PHP: extracts parameters', async (t) => {
  const source = await import_file('./tests/fixtures/test.php');
  const nodes = get_nodes_from_source(source, 'test.php');

  t.assert.ok(nodes.parameter_list.length > 0, 'Should find parameter lists');
});

await test('PHP: builds control flow graph for function with if', async (t) => {
  const source = `<?php
function factorial(int $n): int {
    if ($n <= 1) {
        return 1;
    } else {
        return $n * factorial($n - 1);
    }
}
`;
  const cfg = build_control_flow_from_source(source, 'php', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');
  t.assert.ok(cfg.edges.length > 0, 'Should have edges');

  const decisionNodes = cfg.nodes.filter(n => n.type === 'decision');
  t.assert.ok(decisionNodes.length > 0, 'Should have decision node for if');
});

await test('PHP: builds control flow graph for function with for loop', async (t) => {
  const source = `<?php
function sumToN(int $n): int {
    $sum = 0;
    for ($i = 1; $i <= $n; $i++) {
        $sum += $i;
    }
    return $sum;
}
`;
  const cfg = build_control_flow_from_source(source, 'php', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const loopNodes = cfg.nodes.filter(n => n.type === 'loop');
  t.assert.ok(loopNodes.length > 0, 'Should have loop node for for loop');
});

await test('PHP: builds control flow graph for function with while loop', async (t) => {
  const source = `<?php
function countDigits(int $n): int {
    $count = 0;
    while ($n > 0) {
        $count++;
        $n = intdiv($n, 10);
    }
    return $count;
}
`;
  const cfg = build_control_flow_from_source(source, 'php', 2, 9);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const loopNodes = cfg.nodes.filter(n => n.type === 'loop');
  t.assert.ok(loopNodes.length > 0, 'Should have loop node for while loop');
});

await test('PHP: builds control flow graph for function with foreach', async (t) => {
  const source = `<?php
function sumArray(array $numbers): int {
    $sum = 0;
    foreach ($numbers as $num) {
        $sum += $num;
    }
    return $sum;
}
`;
  const cfg = build_control_flow_from_source(source, 'php', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const loopNodes = cfg.nodes.filter(n => n.type === 'loop');
  t.assert.ok(loopNodes.length > 0, 'Should have loop node for foreach loop');
});

await test('PHP: builds control flow graph for function with switch', async (t) => {
  const source = `<?php
function describe(int $n): string {
    switch ($n) {
        case 0:
            return "zero";
        case 1:
            return "one";
        default:
            return "other";
    }
}
`;
  const cfg = build_control_flow_from_source(source, 'php', 2, 11);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const decisionNodes = cfg.nodes.filter(n => n.type === 'decision');
  t.assert.ok(decisionNodes.length > 0, 'Should have decision node for switch');
});

await test('PHP: builds control flow graph for function with try-catch', async (t) => {
  const source = `<?php
function readFile(string $path): ?string {
    try {
        return file_get_contents($path);
    } catch (Exception $e) {
        return null;
    }
}
`;
  const cfg = build_control_flow_from_source(source, 'php', 2, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');
});
