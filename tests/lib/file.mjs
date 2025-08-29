'use strict';

import {
  import_file,
  text_at_position,
  get_all_filenames_with_type
} from '../../lib/sourcecode.mjs';

import { test } from 'st';

await test('gets the correct content for a position across multiple lines', async (t) => {
  const source = await import_file('./tests/fixtures/test.c');

  const expected = `/**
 * @brief Function to be called.
 *
 * This function prints a greeting message along with the provided argument.
 * @param arg Argument to be passed to the function.
 */`;

  const text = text_at_position({
    source,
    start_line: 10,
    start_position: 0,
    end_line: 15,
    end_position: 3
  });
  t.assert.eq(text, expected, 'The text should match the expected content');
});

await test('gets the correct content for a position of one line', async (t) => {
  const source = await import_file('./tests/fixtures/test.c');

  const expected = `void my_function(int arg) { printf("Hello, World! (%d)\\n", arg); }`;

  const text = text_at_position({
    source,
    start_line: 16,
    start_position: 0,
    end_line: 16,
    end_position: -1
  });
  t.assert.eq(text, expected, 'The text should match the expected content');
});

await test('the full file is returned when only source is requested', async (t) => {
  const source = await import_file('./tests/fixtures/test.c');

  const text = text_at_position({
    source
  });
  t.assert.eq(text, source, 'The text should match the full source');
});

await test('all files of a type can be found from a directory', async (t) => {
  const files = await get_all_filenames_with_type('./tests/fixtures', 'c');

  t.assert.eq(
    files[0],
    'tests/fixtures/test.c',
    'The correct filename is found'
  );
});
