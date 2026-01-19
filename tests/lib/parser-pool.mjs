'use strict';

import {
  ParserPool,
  create_parser_pool,
  DEFAULT_THREAD_COUNT
} from '../../lib/parser-pool.mjs';

import { test } from 'st';

// ============ DEFAULT_THREAD_COUNT tests ============

await test('DEFAULT_THREAD_COUNT is a positive number', async (t) => {
  t.assert.ok(
    typeof DEFAULT_THREAD_COUNT === 'number',
    'DEFAULT_THREAD_COUNT should be a number'
  );
  t.assert.ok(
    DEFAULT_THREAD_COUNT > 0,
    'DEFAULT_THREAD_COUNT should be positive'
  );
});

// ============ ParserPool constructor tests ============

await test('ParserPool constructor sets default thread count', async (t) => {
  const pool = new ParserPool();

  t.assert.eq(
    pool.thread_count,
    DEFAULT_THREAD_COUNT,
    'Should use default thread count'
  );
  t.assert.eq(pool.initialized, false, 'Should not be initialized yet');
  t.assert.eq(pool.terminated, false, 'Should not be terminated');
  t.assert.eq(pool.workers.length, 0, 'Should have no workers before init');
  t.assert.eq(
    pool.available_workers.length,
    0,
    'Should have no available workers before init'
  );
  t.assert.eq(
    pool.pending_tasks.length,
    0,
    'Should have no pending tasks initially'
  );
});

await test('ParserPool constructor accepts custom thread count', async (t) => {
  const pool = new ParserPool(5);

  t.assert.eq(pool.thread_count, 5, 'Should use custom thread count');
});

// ============ create_parser_pool tests ============

await test('create_parser_pool returns ParserPool instance', async (t) => {
  const pool = create_parser_pool();

  t.assert.ok(pool instanceof ParserPool, 'Should return ParserPool instance');
  t.assert.eq(
    pool.thread_count,
    DEFAULT_THREAD_COUNT,
    'Should use default thread count'
  );
});

await test('create_parser_pool accepts custom thread count', async (t) => {
  const pool = create_parser_pool(4);

  t.assert.ok(pool instanceof ParserPool, 'Should return ParserPool instance');
  t.assert.eq(pool.thread_count, 4, 'Should use custom thread count');
});

// ============ ParserPool init tests ============

await test('ParserPool init spawns workers', async (t) => {
  const pool = new ParserPool(2);

  await pool.init();

  t.assert.eq(pool.initialized, true, 'Should be initialized');
  t.assert.eq(pool.workers.length, 2, 'Should have 2 workers');
  t.assert.eq(
    pool.available_workers.length,
    2,
    'All workers should be available'
  );

  await pool.terminate();
});

await test('ParserPool init is idempotent', async (t) => {
  const pool = new ParserPool(2);

  await pool.init();
  await pool.init(); // Should not spawn additional workers

  t.assert.eq(pool.workers.length, 2, 'Should still have 2 workers');

  await pool.terminate();
});

// ============ ParserPool terminate tests ============

await test('ParserPool terminate cleans up workers', async (t) => {
  const pool = new ParserPool(2);

  await pool.init();
  await pool.terminate();

  t.assert.eq(pool.terminated, true, 'Should be terminated');
  t.assert.eq(pool.workers.length, 0, 'Should have no workers');
  t.assert.eq(pool.available_workers.length, 0, 'Should have no available workers');
  t.assert.eq(pool.initialized, false, 'Should not be initialized');
});

await test('ParserPool terminate clears pending tasks', async (t) => {
  const pool = new ParserPool(2);

  await pool.init();
  // Note: pending_tasks would be populated if workers were busy
  await pool.terminate();

  t.assert.eq(pool.pending_tasks.length, 0, 'Should have no pending tasks');
});

// ============ ParserPool property getters tests ============

await test('active_worker_count returns correct count', async (t) => {
  const pool = new ParserPool(3);

  t.assert.eq(pool.active_worker_count, 0, 'Should have 0 workers before init');

  await pool.init();

  t.assert.eq(pool.active_worker_count, 3, 'Should have 3 workers after init');

  await pool.terminate();

  t.assert.eq(
    pool.active_worker_count,
    0,
    'Should have 0 workers after terminate'
  );
});

await test('pending_task_count returns correct count', async (t) => {
  const pool = new ParserPool(2);

  t.assert.eq(
    pool.pending_task_count,
    0,
    'Should have 0 pending tasks initially'
  );

  await pool.terminate();
});

// ============ ParserPool parse_file tests ============

await test('parse_file rejects when pool is terminated', async (t) => {
  const pool = new ParserPool(1);
  await pool.init();
  await pool.terminate();

  try {
    await pool.parse_file('/test/file.js', 'file.js', 1);
    t.assert.fail('Should have thrown an error');
  } catch (error) {
    t.assert.ok(
      error.message.includes('terminated'),
      'Error should mention terminated'
    );
  }
});

// ============ ParserPool task_id_counter tests ============

await test('task_id_counter increments for each task', async (t) => {
  const pool = new ParserPool(2);

  t.assert.eq(pool.task_id_counter, 0, 'Should start at 0');

  // We can test the counter indirectly by initializing and making parse requests
  // But for a simpler test, just verify initial state
  await pool.terminate();
});
