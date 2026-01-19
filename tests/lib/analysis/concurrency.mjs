'use strict';

/**
 * @fileoverview Tests for concurrency analysis module.
 * Tests pattern detection for async/await, threads, locks, and race conditions.
 */

import { test } from 'st';
import { query } from '../../../lib/db.mjs';
import { insert_or_update_project } from '../../../lib/model/project.mjs';
import { insert_or_update_entity } from '../../../lib/model/entity.mjs';
import {
  analyze_function_concurrency,
  analyze_project_concurrency,
  CONCURRENCY_PATTERNS
} from '../../../lib/analysis/concurrency.mjs';

// Counter to ensure unique project names
let test_counter = 0;

/**
 * Clean up any leftover test projects from previous runs.
 */
const cleanup_all_test_projects = async () => {
  const projects =
    await query`SELECT id FROM project WHERE name LIKE '_test_concurrency_%'`;
  for (const p of projects) {
    await query`DELETE FROM entity WHERE project_id = ${p.id}`;
    await query`DELETE FROM project WHERE id = ${p.id}`;
  }
  if (projects.length > 0) {
    await query`REFRESH MATERIALIZED VIEW project_stats`;
  }
};

// Clean up before tests
await cleanup_all_test_projects();

/**
 * Create test project.
 */
const setup_test_project = async () => {
  const test_id = ++test_counter;
  const project_name = `_test_concurrency_${test_id}_${Date.now()}`;

  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_concurrency_${test_id}`
  });
  return project_result[0].id;
};

/**
 * Clean up test fixtures.
 */
const cleanup_test_fixtures = async (project_id) => {
  if (project_id === undefined) return;
  await query`DELETE FROM entity WHERE project_id = ${project_id}`;
  await query`DELETE FROM project WHERE id = ${project_id}`;
};

// ============ CONCURRENCY_PATTERNS structure tests ============

await test('CONCURRENCY_PATTERNS has patterns for JavaScript', (t) => {
  const js = CONCURRENCY_PATTERNS.javascript;
  t.assert.ok(js, 'Should have JavaScript patterns');
  t.assert.ok(js.async_patterns, 'Should have async_patterns');
  t.assert.ok(js.thread_patterns, 'Should have thread_patterns');
  t.assert.ok(js.sync_patterns, 'Should have sync_patterns');
  t.assert.ok(js.timer_patterns, 'Should have timer_patterns');
});

await test('CONCURRENCY_PATTERNS has patterns for Python', (t) => {
  const py = CONCURRENCY_PATTERNS.python;
  t.assert.ok(py, 'Should have Python patterns');
  t.assert.ok(py.async_patterns.length > 0, 'Should have async patterns');
  t.assert.ok(py.thread_patterns.length > 0, 'Should have thread patterns');
});

await test('CONCURRENCY_PATTERNS has patterns for Go', (t) => {
  const go = CONCURRENCY_PATTERNS.go;
  t.assert.ok(go, 'Should have Go patterns');
  t.assert.ok(go.async_patterns.length > 0, 'Should have goroutine patterns');
  t.assert.ok(go.sync_patterns.length > 0, 'Should have sync patterns (channels, mutex)');
});

await test('CONCURRENCY_PATTERNS has patterns for Rust', (t) => {
  const rust = CONCURRENCY_PATTERNS.rust;
  t.assert.ok(rust, 'Should have Rust patterns');
  t.assert.ok(rust.async_patterns.length > 0, 'Should have async patterns');
  t.assert.ok(rust.sync_patterns.length > 0, 'Should have sync patterns');
});

// ============ analyze_function_concurrency tests ============

await test('analyze_function_concurrency detects async/await in JavaScript', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_async',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `
      async function test_async() {
        const result = await fetch('/api/data');
        return result.json();
      }
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.ok(result.async_patterns.length > 0, 'Should detect async patterns');
  const types = result.async_patterns.map((p) => p.type);
  t.assert.ok(types.includes('async_function'), 'Should detect async function');
  t.assert.ok(types.includes('await'), 'Should detect await');
});

await test('analyze_function_concurrency detects Promise patterns', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_promise',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `
      function test_promise() {
        return new Promise((resolve) => {
          fetch('/api').then(r => r.json()).catch(console.error);
        });
      }
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.ok(result.async_patterns.length > 0, 'Should detect async patterns');
  const types = result.async_patterns.map((p) => p.type);
  t.assert.ok(types.includes('promise_constructor'), 'Should detect Promise constructor');
  t.assert.ok(types.includes('promise_then'), 'Should detect .then()');
  t.assert.ok(types.includes('promise_catch'), 'Should detect .catch()');
});

await test('analyze_function_concurrency detects Web Workers', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_worker',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `
      function test_worker() {
        const worker = new Worker('worker.js');
        worker.postMessage({ data: 'test' });
      }
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.ok(result.thread_patterns.length > 0, 'Should detect thread patterns');
  const types = result.thread_patterns.map((p) => p.type);
  t.assert.ok(types.includes('web_worker'), 'Should detect Web Worker');
  t.assert.ok(types.includes('worker_message'), 'Should detect postMessage');
});

await test('analyze_function_concurrency detects setTimeout/setInterval', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_timers',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `
      function test_timers() {
        setTimeout(() => console.log('delayed'), 1000);
        setInterval(() => console.log('repeated'), 500);
      }
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.ok(result.timer_patterns.length > 0, 'Should detect timer patterns');
  const types = result.timer_patterns.map((p) => p.type);
  t.assert.ok(types.includes('setTimeout'), 'Should detect setTimeout');
  t.assert.ok(types.includes('setInterval'), 'Should detect setInterval');
});

await test('analyze_function_concurrency detects Python async', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_async_py',
    filename: 'test.py',
    start_line: 1,
    language: 'python',
    source: `
      async def test_async_py():
          result = await asyncio.gather(task1(), task2())
          return result
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.ok(result.async_patterns.length > 0, 'Should detect async patterns');
  const types = result.async_patterns.map((p) => p.type);
  t.assert.ok(types.includes('async_function'), 'Should detect async def');
  t.assert.ok(types.includes('await'), 'Should detect await');
  t.assert.ok(types.includes('asyncio'), 'Should detect asyncio usage');
});

await test('analyze_function_concurrency detects Python threading', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_threads_py',
    filename: 'test.py',
    start_line: 1,
    language: 'python',
    source: `
      def test_threads_py():
          lock = threading.Lock()
          t = threading.Thread(target=worker)
          t.start()
          with lock:
              shared_data += 1
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.ok(result.thread_patterns.length > 0, 'Should detect thread patterns');
  const types = result.thread_patterns.map((p) => p.type);
  t.assert.ok(types.includes('thread'), 'Should detect Thread');
  t.assert.ok(types.includes('lock'), 'Should detect Lock');
});

await test('analyze_function_concurrency detects Go goroutines and channels', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_go_concurrency',
    filename: 'test.go',
    start_line: 1,
    language: 'go',
    source: `
      func test_go_concurrency() {
          ch := make(chan int)
          go func() {
              ch <- 42
          }()
          result := <-ch
          return result
      }
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.ok(result.async_patterns.length > 0, 'Should detect goroutine patterns');
  t.assert.ok(result.sync_patterns.length > 0, 'Should detect channel patterns');

  const async_types = result.async_patterns.map((p) => p.type);
  t.assert.ok(
    async_types.includes('goroutine_anon'),
    'Should detect anonymous goroutine'
  );

  const sync_types = result.sync_patterns.map((p) => p.type);
  t.assert.ok(sync_types.includes('channel_make'), 'Should detect channel creation');
  t.assert.ok(sync_types.includes('channel_send'), 'Should detect channel send');
  t.assert.ok(sync_types.includes('channel_receive'), 'Should detect channel receive');
});

await test('analyze_function_concurrency detects Go mutex', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_go_mutex',
    filename: 'test.go',
    start_line: 1,
    language: 'go',
    source: `
      func test_go_mutex() {
          var mu sync.Mutex
          mu.Lock()
          defer mu.Unlock()
          // critical section
      }
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.ok(result.sync_patterns.length > 0, 'Should detect sync patterns');
  const types = result.sync_patterns.map((p) => p.type);
  t.assert.ok(types.includes('mutex'), 'Should detect Mutex');
  t.assert.ok(types.includes('lock_acquire'), 'Should detect Lock()');
  t.assert.ok(types.includes('lock_release'), 'Should detect Unlock()');
});

await test('analyze_function_concurrency detects Java concurrency', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_java_concurrency',
    filename: 'Test.java',
    start_line: 1,
    language: 'java',
    source: `
      void test_java_concurrency() {
          ExecutorService executor = Executors.newFixedThreadPool(4);
          CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> "result");
          synchronized(lock) {
              counter++;
          }
      }
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.ok(result.async_patterns.length > 0, 'Should detect async patterns');
  t.assert.ok(result.thread_patterns.length > 0, 'Should detect thread patterns');
  t.assert.ok(result.sync_patterns.length > 0, 'Should detect sync patterns');

  const async_types = result.async_patterns.map((p) => p.type);
  t.assert.ok(
    async_types.includes('completable_future'),
    'Should detect CompletableFuture'
  );

  const thread_types = result.thread_patterns.map((p) => p.type);
  t.assert.ok(thread_types.includes('executor'), 'Should detect ExecutorService');

  const sync_types = result.sync_patterns.map((p) => p.type);
  t.assert.ok(
    sync_types.includes('synchronized_block'),
    'Should detect synchronized block'
  );
});

await test('analyze_function_concurrency detects Rust async', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_rust_async',
    filename: 'test.rs',
    start_line: 1,
    language: 'rust',
    source: `
      async fn test_rust_async() {
          let result = fetch_data().await;
          let handle = tokio::spawn(async move {
              heavy_computation()
          });
      }
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.ok(result.async_patterns.length > 0, 'Should detect async patterns');
  const types = result.async_patterns.map((p) => p.type);
  t.assert.ok(types.includes('async_function'), 'Should detect async fn');
  t.assert.ok(types.includes('await'), 'Should detect .await');
  t.assert.ok(types.includes('tokio'), 'Should detect tokio');
});

await test('analyze_function_concurrency warns about missing synchronization', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_no_sync',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `
      async function test_no_sync() {
        const result = await fetch('/api');
        globalCounter++;  // No synchronization!
      }
    `
  };

  const result = analyze_function_concurrency(fn);

  // Has async but no sync patterns - should warn
  t.assert.ok(result.async_patterns.length > 0, 'Should have async patterns');
  t.assert.eq(result.sync_patterns.length, 0, 'Should have no sync patterns');
  t.assert.ok(result.warnings.length > 0, 'Should have warnings');
  t.assert.ok(
    result.warnings.some((w) => w.id === 'shared_state_no_lock'),
    'Should warn about shared state without lock'
  );
});

await test('analyze_function_concurrency returns empty for non-concurrent code', (t) => {
  const fn = {
    id: 1,
    symbol: 'simple_function',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `
      function simple_function(a, b) {
        return a + b;
      }
    `
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(result.async_patterns.length, 0, 'Should have no async patterns');
  t.assert.eq(result.thread_patterns.length, 0, 'Should have no thread patterns');
  t.assert.eq(result.sync_patterns.length, 0, 'Should have no sync patterns');
  t.assert.eq(result.timer_patterns.length, 0, 'Should have no timer patterns');
  t.assert.eq(result.warnings.length, 0, 'Should have no warnings');
});

// ============ analyze_project_concurrency tests ============

await test('analyze_project_concurrency analyzes all functions', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    await insert_or_update_entity({
      project_id,
      symbol: 'async_func',
      type: 'function',
      filename: 'async.js',
      language: 'javascript',
      start_line: 1,
      end_line: 5,
      parameters: '',
      return_type: 'Promise',
      source: 'async function async_func() { await delay(100); }',
      comment: null
    });

    await insert_or_update_entity({
      project_id,
      symbol: 'sync_func',
      type: 'function',
      filename: 'sync.js',
      language: 'javascript',
      start_line: 1,
      end_line: 3,
      parameters: '',
      return_type: 'number',
      source: 'function sync_func() { return 42; }',
      comment: null
    });

    const result = await analyze_project_concurrency(project_id);

    t.assert.ok(result.summary, 'Should have summary');
    t.assert.eq(
      result.summary.functions_analyzed,
      2,
      'Should analyze 2 functions'
    );
    t.assert.ok(
      result.summary.functions_with_concurrency >= 1,
      'Should find at least 1 concurrent function'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('analyze_project_concurrency groups by file', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    await insert_or_update_entity({
      project_id,
      symbol: 'worker_a',
      type: 'function',
      filename: 'workers.js',
      language: 'javascript',
      start_line: 1,
      end_line: 5,
      parameters: '',
      return_type: 'void',
      source: 'async function worker_a() { await task(); }',
      comment: null
    });

    await insert_or_update_entity({
      project_id,
      symbol: 'worker_b',
      type: 'function',
      filename: 'workers.js',
      language: 'javascript',
      start_line: 7,
      end_line: 12,
      parameters: '',
      return_type: 'void',
      source: 'async function worker_b() { await other_task(); }',
      comment: null
    });

    const result = await analyze_project_concurrency(project_id);

    t.assert.ok(result.by_file, 'Should have by_file grouping');
    t.assert.ok(result.by_file['workers.js'], 'Should have workers.js');
    t.assert.eq(
      result.by_file['workers.js'].functions.length,
      2,
      'workers.js should have 2 functions'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('analyze_project_concurrency groups patterns by type', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    await insert_or_update_entity({
      project_id,
      symbol: 'multi_pattern',
      type: 'function',
      filename: 'test.js',
      language: 'javascript',
      start_line: 1,
      end_line: 10,
      parameters: '',
      return_type: 'void',
      source: `
        async function multi_pattern() {
          await Promise.all([task1(), task2()]);
          setTimeout(() => cleanup(), 1000);
        }
      `,
      comment: null
    });

    const result = await analyze_project_concurrency(project_id);

    t.assert.ok(
      result.async_patterns_grouped,
      'Should have grouped async patterns'
    );
    t.assert.ok(
      result.timer_patterns_grouped,
      'Should have grouped timer patterns'
    );

    // Check that patterns are grouped with counts
    if (result.async_patterns_grouped.length > 0) {
      t.assert.ok(
        result.async_patterns_grouped[0].count,
        'Grouped patterns should have count'
      );
      t.assert.ok(
        result.async_patterns_grouped[0].locations,
        'Grouped patterns should have locations'
      );
    }
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// Final cleanup
await cleanup_all_test_projects();
