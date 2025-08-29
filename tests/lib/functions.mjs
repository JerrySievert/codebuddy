'use strict';

import { create_tree, get_nodes_from_source } from '../../lib/functions.mjs';
import { import_file, text_at_position } from '../../lib/sourcecode.mjs';

import { test } from 'st';

await test('a tree is generated from a file', async (t) => {
  const source = await import_file('./tests/fixtures/test.c');

  const tree = create_tree(source);

  t.assert.ok(tree, 'The tree should be generated');
});

await test('a tree can have its default types extracted', async (t) => {
  const source = await import_file('./tests/fixtures/test.c');

  const nodes = get_nodes_from_source(source);

  t.assert.eq(
    nodes.call_expression.length,
    2,
    'The nodes should be extracted for call_expression'
  );

  t.assert.eq(
    nodes.comment.length,
    2,
    'The nodes should be extracted for comment'
  );

  const expected_call_1 = `printf("Hello, World! (%d)\\n", arg)`;

  t.assert.eq(
    text_at_position({
      source,
      start_line: nodes.call_expression[0].start_line,
      start_position: nodes.call_expression[0].start_position,
      end_line: nodes.call_expression[0].end_line,
      end_position: nodes.call_expression[0].end_position
    }),
    expected_call_1,
    'The text should match the expected content'
  );

  const expected_comment_2 = `// Call the function with an argument`;

  t.assert.eq(
    text_at_position({
      source,
      start_line: nodes.comment[1].start_line,
      start_position: nodes.comment[1].start_position,
      end_line: nodes.comment[1].end_line,
      end_position: nodes.comment[1].end_position
    }),
    expected_comment_2,
    'The text should match the expected content'
  );
});
