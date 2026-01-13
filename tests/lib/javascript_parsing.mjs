'use strict';

import { get_nodes_from_source, get_return_type_from_function } from '../../lib/functions.mjs';
import { import_file } from '../../lib/sourcecode.mjs';

import { test } from 'st';

await test('JavaScript: parses function declarations', async (t) => {
  const source = await import_file('./tests/fixtures/test.js');
  const nodes = get_nodes_from_source(source, 'test.js');

  const funcNames = nodes.function_definition.map(f => f.content.substring(0, 50));

  t.assert.ok(nodes.function_definition.length > 0, 'Should find function definitions');
  t.assert.ok(funcNames.some(n => n.includes('greet')), 'Should find greet function');
  t.assert.ok(funcNames.some(n => n.includes('add')), 'Should find add function');
});

await test('JavaScript: parses arrow functions', async (t) => {
  const source = await import_file('./tests/fixtures/test.js');
  const nodes = get_nodes_from_source(source, 'test.js');

  // Arrow functions should be captured
  const arrowFuncs = nodes.function_definition.filter(f => f.type === 'arrow_function');
  t.assert.ok(arrowFuncs.length > 0, 'Should find arrow functions');
});

await test('JavaScript: parses class methods', async (t) => {
  const source = await import_file('./tests/fixtures/test.js');
  const nodes = get_nodes_from_source(source, 'test.js');

  // Method definitions should be captured
  const methods = nodes.function_definition.filter(f => f.type === 'method_definition');
  t.assert.ok(methods.length > 0, 'Should find class methods');
});

await test('JavaScript: parses async functions', async (t) => {
  const source = await import_file('./tests/fixtures/test.js');
  const nodes = get_nodes_from_source(source, 'test.js');

  const funcContents = nodes.function_definition.map(f => f.content);
  t.assert.ok(funcContents.some(c => c.includes('async')), 'Should find async function');
});

await test('JavaScript: extracts call expressions', async (t) => {
  const source = await import_file('./tests/fixtures/test.js');
  const nodes = get_nodes_from_source(source, 'test.js');

  t.assert.ok(nodes.call_expression.length > 0, 'Should find call expressions');
});

await test('JavaScript: extracts comments', async (t) => {
  const source = await import_file('./tests/fixtures/test.js');
  const nodes = get_nodes_from_source(source, 'test.js');

  t.assert.ok(nodes.comment.length > 0, 'Should find comments');
});

await test('JavaScript: extracts formal parameters', async (t) => {
  const source = await import_file('./tests/fixtures/test.js');
  const nodes = get_nodes_from_source(source, 'test.js');

  t.assert.ok(nodes.parameter_list.length > 0, 'Should find parameter lists');
});

await test('JavaScript: get_return_type_from_function returns correct types', async (t) => {
  const source = `
    function foo() { return 1; }
    const bar = () => 2;
    class X { method() {} }
  `;
  const nodes = get_nodes_from_source(source, 'test.js');

  const funcDef = nodes.function_definition.find(f => f.type === 'function_declaration');
  const arrowFunc = nodes.function_definition.find(f => f.type === 'arrow_function');
  const methodDef = nodes.function_definition.find(f => f.type === 'method_definition');

  if (funcDef) {
    const funcType = get_return_type_from_function(funcDef, 'javascript');
    t.assert.eq(funcType, 'function', 'Function declaration should return "function"');
  }

  if (arrowFunc) {
    const arrowType = get_return_type_from_function(arrowFunc, 'javascript');
    t.assert.eq(arrowType, 'arrow_function', 'Arrow function should return "arrow_function"');
  }

  if (methodDef) {
    const methodType = get_return_type_from_function(methodDef, 'javascript');
    t.assert.eq(methodType, 'method', 'Method definition should return "method"');
  }
});

await test('JavaScript: parses function expressions', async (t) => {
  const source = `const fn = function() { return 1; };`;
  const nodes = get_nodes_from_source(source, 'test.js');

  const funcExpr = nodes.function_definition.find(f => f.type === 'function_expression');
  t.assert.ok(funcExpr, 'Should find function expression');
});
