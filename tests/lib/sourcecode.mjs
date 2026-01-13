'use strict';

import { text_at_position, get_all_filenames_with_type, import_file } from '../../lib/sourcecode.mjs';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { test } from 'st';

// ============ text_at_position tests ============

await test('text_at_position extracts full source when no positions specified', async (t) => {
  const source = `line 1
line 2
line 3
line 4
line 5`;

  const result = text_at_position({ source });
  t.assert.eq(result, source, 'Should return full source');
});

await test('text_at_position extracts single line', async (t) => {
  const source = `line 1
line 2
line 3`;

  const result = text_at_position({ source, start_line: 2, end_line: 2 });
  t.assert.eq(result, 'line 2', 'Should extract line 2 only');
});

await test('text_at_position extracts range of lines', async (t) => {
  const source = `line 1
line 2
line 3
line 4
line 5`;

  const result = text_at_position({ source, start_line: 2, end_line: 4 });
  t.assert.eq(result, 'line 2\nline 3\nline 4', 'Should extract lines 2-4');
});

await test('text_at_position extracts with start position', async (t) => {
  const source = `hello world
foo bar`;

  const result = text_at_position({ source, start_line: 1, end_line: 1, start_position: 6 });
  t.assert.eq(result, 'world', 'Should start from position 6 on line 1');
});

await test('text_at_position extracts with end position', async (t) => {
  const source = `hello world
foo bar`;

  const result = text_at_position({ source, start_line: 1, end_line: 1, start_position: 0, end_position: 5 });
  t.assert.eq(result, 'hello', 'Should end at position 5 on line 1');
});

await test('text_at_position handles partial line extraction', async (t) => {
  const source = `first line here
second line here
third line here`;

  const result = text_at_position({
    source,
    start_line: 1,
    end_line: 2,
    start_position: 6,
    end_position: 6
  });
  t.assert.eq(result, 'line here\nsecond', 'Should extract partial first and last lines');
});

await test('text_at_position handles from middle to end of file', async (t) => {
  const source = `line 1
line 2
line 3`;

  const result = text_at_position({ source, start_line: 2 });
  t.assert.eq(result, 'line 2\nline 3', 'Should extract from line 2 to end');
});

// ============ get_all_filenames_with_type tests ============

await test('get_all_filenames_with_type finds files recursively', async (t) => {
  const testDir = join(tmpdir(), `codebuddy-test-${Date.now()}`);
  const subDir = join(testDir, 'subdir');

  // Setup test directory
  await mkdir(subDir, { recursive: true });
  await writeFile(join(testDir, 'file1.js'), 'content1');
  await writeFile(join(testDir, 'file2.js'), 'content2');
  await writeFile(join(testDir, 'file3.py'), 'content3');
  await writeFile(join(subDir, 'file4.js'), 'content4');
  await writeFile(join(subDir, 'file5.txt'), 'content5');

  const jsFiles = await get_all_filenames_with_type(testDir, 'js');
  const pyFiles = await get_all_filenames_with_type(testDir, 'py');
  const txtFiles = await get_all_filenames_with_type(testDir, 'txt');

  // Cleanup
  await rm(testDir, { recursive: true, force: true });

  t.assert.eq(jsFiles.length, 3, 'Should find all .js files including in subdirectories');
  t.assert.eq(pyFiles.length, 1, 'Should find .py files');
  t.assert.eq(txtFiles.length, 1, 'Should find .txt files in subdirectories');
  t.assert.eq(jsFiles.every(f => f.endsWith('.js')), true, 'All found files should have correct extension');
});

// ============ import_file tests ============

await test('import_file reads file contents', async (t) => {
  const testDir = join(tmpdir(), `codebuddy-import-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  const testFile = join(testDir, 'test.txt');
  const testContent = 'Hello, World!\nLine 2\nLine 3';
  await writeFile(testFile, testContent);

  const content = await import_file(testFile);

  // Cleanup
  await rm(testDir, { recursive: true, force: true });

  t.assert.eq(content, testContent, 'Should read file contents correctly');
});

await test('import_file throws on non-existent file', async (t) => {
  let threw = false;
  try {
    await import_file('/nonexistent/path/to/file.txt');
  } catch (e) {
    threw = true;
  }

  t.assert.eq(threw, true, 'Should throw error for non-existent file');
});
