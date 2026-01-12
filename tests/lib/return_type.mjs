'use strict';

import {
  get_nodes_from_source,
  get_return_type_from_function
} from '../../lib/functions.mjs';
import { import_file } from '../../lib/sourcecode.mjs';

import { test } from 'st';

// Helper: extract function name from content
const getFunctionName = (content) => {
  const name_parts = content
    .substring(0, content.indexOf('('))
    .replace(/\s+/g, ' ')
    .replace(/\*/g, '')
    .split(' ');
  return name_parts[name_parts.length - 1].trim();
};

await test('simple primitive return types are correctly extracted', async (t) => {
  const source = await import_file('./tests/fixtures/test.c');
  const nodes = get_nodes_from_source(source, 'test.c');

  const my_function_def = nodes.function_definition.find((f) =>
    f.content.includes('my_function(int arg)')
  );
  const main_def = nodes.function_definition.find((f) =>
    f.content.includes('main')
  );

  t.assert.ok(my_function_def, 'my_function definition should be found');
  t.assert.ok(main_def, 'main definition should be found');

  const my_function_type = get_return_type_from_function(my_function_def);
  const main_type = get_return_type_from_function(main_def);

  t.assert.eq(my_function_type, 'void', 'my_function should return void');
  t.assert.eq(main_type, 'int', 'main should return int');
});

await test('sized_type_specifier return types (unsigned int, long long) are correctly extracted', async (t) => {
  const source = await import_file('./tests/fixtures/test_types.c');
  const nodes = get_nodes_from_source(source, 'test_types.c');

  // Find the get_count function (returns unsigned int)
  const get_count = nodes.function_definition.find(
    (f) => getFunctionName(f.content) === 'get_count'
  );
  t.assert.ok(get_count, 'get_count function should be found');

  const get_count_type = get_return_type_from_function(get_count);
  t.assert.eq(
    get_count_type,
    'unsigned int',
    'get_count should return "unsigned int"'
  );

  // Find the get_big_number function (returns long long)
  const get_big_number = nodes.function_definition.find(
    (f) => getFunctionName(f.content) === 'get_big_number'
  );
  t.assert.ok(get_big_number, 'get_big_number function should be found');

  const get_big_number_type = get_return_type_from_function(get_big_number);
  t.assert.eq(
    get_big_number_type,
    'long long',
    'get_big_number should return "long long"'
  );
});

await test('struct_specifier return types are correctly extracted', async (t) => {
  const source = await import_file('./tests/fixtures/test_types.c');
  const nodes = get_nodes_from_source(source, 'test_types.c');

  // Find the get_node function (returns struct node*)
  const get_node = nodes.function_definition.find(
    (f) => getFunctionName(f.content) === 'get_node'
  );
  t.assert.ok(get_node, 'get_node function should be found');

  const get_node_type = get_return_type_from_function(get_node);
  t.assert.eq(
    get_node_type,
    'struct node',
    'get_node should return "struct node"'
  );
});

await test('type qualifiers (const) are correctly captured', async (t) => {
  const source = await import_file('./tests/fixtures/test_types.c');
  const nodes = get_nodes_from_source(source, 'test_types.c');

  // Find the get_const_string function (returns const char*)
  const get_const_string = nodes.function_definition.find(
    (f) => getFunctionName(f.content) === 'get_const_string'
  );
  t.assert.ok(get_const_string, 'get_const_string function should be found');

  const get_const_string_type = get_return_type_from_function(get_const_string);
  t.assert.eq(
    get_const_string_type,
    'const char',
    'get_const_string should return "const char"'
  );
});

await test('pointer return types capture base type correctly', async (t) => {
  const source = await import_file('./tests/fixtures/test_types.c');
  const nodes = get_nodes_from_source(source, 'test_types.c');

  // Find the get_string function (returns char*)
  const get_string = nodes.function_definition.find(
    (f) => getFunctionName(f.content) === 'get_string'
  );
  t.assert.ok(get_string, 'get_string function should be found');

  const get_string_type = get_return_type_from_function(get_string);
  t.assert.eq(get_string_type, 'char', 'get_string should return "char"');
});

await test('typedef types (size_t) are correctly extracted', async (t) => {
  const source = await import_file('./tests/fixtures/test_types.c');
  const nodes = get_nodes_from_source(source, 'test_types.c');

  // Find the get_size function (returns size_t)
  const get_size = nodes.function_definition.find(
    (f) => getFunctionName(f.content) === 'get_size'
  );
  t.assert.ok(get_size, 'get_size function should be found');

  const get_size_type = get_return_type_from_function(get_size);
  t.assert.eq(get_size_type, 'size_t', 'get_size should return "size_t"');
});

await test('void return type is correctly extracted', async (t) => {
  const source = await import_file('./tests/fixtures/test_types.c');
  const nodes = get_nodes_from_source(source, 'test_types.c');

  // Find the do_nothing function (returns void)
  const do_nothing = nodes.function_definition.find(
    (f) => getFunctionName(f.content) === 'do_nothing'
  );
  t.assert.ok(do_nothing, 'do_nothing function should be found');

  const do_nothing_type = get_return_type_from_function(do_nothing);
  t.assert.eq(do_nothing_type, 'void', 'do_nothing should return "void"');
});
