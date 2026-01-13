'use strict';

import { get_nodes_from_source, get_return_type_from_function } from '../../lib/functions.mjs';
import { import_file } from '../../lib/sourcecode.mjs';

import { test } from 'st';

await test('Python: parses function definitions', async (t) => {
  const source = await import_file('./tests/fixtures/test.py');
  const nodes = get_nodes_from_source(source, 'test.py');

  t.assert.ok(nodes.function_definition.length > 0, 'Should find function definitions');

  const funcContents = nodes.function_definition.map(f => f.content.substring(0, 50));
  t.assert.ok(funcContents.some(c => c.includes('def greet')), 'Should find greet function');
  t.assert.ok(funcContents.some(c => c.includes('def add')), 'Should find add function');
});

await test('Python: parses class methods', async (t) => {
  const source = await import_file('./tests/fixtures/test.py');
  const nodes = get_nodes_from_source(source, 'test.py');

  const funcContents = nodes.function_definition.map(f => f.content);
  t.assert.ok(funcContents.some(c => c.includes('def __init__')), 'Should find __init__ method');
  t.assert.ok(funcContents.some(c => c.includes('self')), 'Should find methods with self parameter');
});

await test('Python: parses async functions', async (t) => {
  const source = await import_file('./tests/fixtures/test.py');
  const nodes = get_nodes_from_source(source, 'test.py');

  const funcContents = nodes.function_definition.map(f => f.content);
  t.assert.ok(funcContents.some(c => c.includes('async def')), 'Should find async function');
});

await test('Python: parses decorated functions', async (t) => {
  const source = await import_file('./tests/fixtures/test.py');
  const nodes = get_nodes_from_source(source, 'test.py');

  const funcContents = nodes.function_definition.map(f => f.content);
  t.assert.ok(funcContents.some(c => c.includes('decorated_add')), 'Should find decorated function');
});

await test('Python: parses generator functions', async (t) => {
  const source = await import_file('./tests/fixtures/test.py');
  const nodes = get_nodes_from_source(source, 'test.py');

  const funcContents = nodes.function_definition.map(f => f.content);
  t.assert.ok(funcContents.some(c => c.includes('yield')), 'Should find generator function');
});

await test('Python: extracts call expressions', async (t) => {
  const source = await import_file('./tests/fixtures/test.py');
  const nodes = get_nodes_from_source(source, 'test.py');

  // Python call expressions are normalized to call_expression
  t.assert.ok(nodes.call_expression.length > 0, 'Should find call expressions');
});

await test('Python: extracts comments', async (t) => {
  const source = await import_file('./tests/fixtures/test.py');
  const nodes = get_nodes_from_source(source, 'test.py');

  t.assert.ok(nodes.comment.length > 0, 'Should find comments');
});

await test('Python: extracts parameters', async (t) => {
  const source = await import_file('./tests/fixtures/test.py');
  const nodes = get_nodes_from_source(source, 'test.py');

  t.assert.ok(nodes.parameter_list.length > 0, 'Should find parameter lists');
});

await test('Python: get_return_type_from_function returns def for untyped', async (t) => {
  const source = `
def foo():
    return 1
`;
  const nodes = get_nodes_from_source(source, 'test.py');

  const funcDef = nodes.function_definition[0];
  if (funcDef) {
    const returnType = get_return_type_from_function(funcDef, 'python');
    t.assert.eq(returnType, 'def', 'Untyped Python function should return "def"');
  }
});

await test('Python: parses nested functions', async (t) => {
  const source = await import_file('./tests/fixtures/test.py');
  const nodes = get_nodes_from_source(source, 'test.py');

  const funcContents = nodes.function_definition.map(f => f.content);
  t.assert.ok(funcContents.some(c => c.includes('inner_function')), 'Should find nested function');
});

await test('Python: parses staticmethod and classmethod', async (t) => {
  const source = await import_file('./tests/fixtures/test.py');
  const nodes = get_nodes_from_source(source, 'test.py');

  const funcContents = nodes.function_definition.map(f => f.content);
  t.assert.ok(funcContents.some(c => c.includes('def create')), 'Should find staticmethod');
  t.assert.ok(funcContents.some(c => c.includes('def from_string')), 'Should find classmethod');
});
