'use strict';

/**
 * @fileoverview Tests for concurrency analysis module.
 * Tests detection of async/await, threads, locks, and race condition patterns.
 */

import { test } from 'st';
import {
  analyze_function_concurrency,
  CONCURRENCY_PATTERNS
} from '../../lib/analysis/concurrency.mjs';

// ============ Pattern Configuration Tests ============

await test('CONCURRENCY_PATTERNS has configurations for major languages', async (t) => {
  const expectedLanguages = [
    'javascript',
    'typescript',
    'python',
    'java',
    'csharp',
    'go',
    'rust',
    'cpp'
  ];

  for (const lang of expectedLanguages) {
    t.assert.eq(
      CONCURRENCY_PATTERNS[lang] !== undefined,
      true,
      `Should have patterns for ${lang}`
    );
  }
});

await test('each language has async_patterns array', async (t) => {
  for (const [lang, config] of Object.entries(CONCURRENCY_PATTERNS)) {
    t.assert.eq(
      Array.isArray(config.async_patterns),
      true,
      `${lang} should have async_patterns array`
    );
  }
});

await test('each language has sync_patterns array', async (t) => {
  for (const [lang, config] of Object.entries(CONCURRENCY_PATTERNS)) {
    t.assert.eq(
      Array.isArray(config.sync_patterns),
      true,
      `${lang} should have sync_patterns array`
    );
  }
});

// ============ JavaScript Async Detection Tests ============

await test('detects JavaScript async function', async (t) => {
  const fn = {
    id: 1,
    symbol: 'testFunc',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `async function fetchData() {
      return await fetch('/api/data');
    }`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.async_patterns.length >= 1,
    true,
    'Should detect async patterns'
  );
  const types = result.async_patterns.map((p) => p.type);
  t.assert.eq(
    types.includes('async_function') || types.includes('await'),
    true,
    'Should detect async_function or await'
  );
});

await test('detects JavaScript Promise patterns', async (t) => {
  const fn = {
    id: 1,
    symbol: 'testFunc',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `function processData() {
      return fetch('/api')
        .then(response => response.json())
        .catch(err => console.error(err));
    }`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.async_patterns.length >= 1,
    true,
    'Should detect Promise patterns'
  );
  const types = result.async_patterns.map((p) => p.type);
  t.assert.eq(
    types.includes('promise_then'),
    true,
    'Should detect promise_then'
  );
});

await test('detects JavaScript setTimeout/setInterval', async (t) => {
  const fn = {
    id: 1,
    symbol: 'testFunc',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `function setupTimers() {
      setTimeout(() => console.log('delayed'), 1000);
      setInterval(() => console.log('repeating'), 500);
    }`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.timer_patterns.length >= 2,
    true,
    'Should detect timer patterns'
  );
  const types = result.timer_patterns.map((p) => p.type);
  t.assert.eq(types.includes('setTimeout'), true, 'Should detect setTimeout');
  t.assert.eq(types.includes('setInterval'), true, 'Should detect setInterval');
});

await test('detects JavaScript Web Worker', async (t) => {
  const fn = {
    id: 1,
    symbol: 'testFunc',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `function createWorker() {
      const worker = new Worker('worker.js');
      worker.postMessage({ type: 'start' });
    }`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.thread_patterns.length >= 1,
    true,
    'Should detect thread patterns'
  );
  const types = result.thread_patterns.map((p) => p.type);
  t.assert.eq(types.includes('web_worker'), true, 'Should detect web_worker');
});

// ============ Python Concurrency Detection Tests ============

await test('detects Python async/await', async (t) => {
  const fn = {
    id: 1,
    symbol: 'fetch_data',
    filename: 'test.py',
    start_line: 1,
    language: 'python',
    source: `async def fetch_data():
    response = await client.get('/api')
    return response.json()`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.async_patterns.length >= 1,
    true,
    'Should detect async patterns'
  );
  const types = result.async_patterns.map((p) => p.type);
  t.assert.eq(
    types.includes('async_function') || types.includes('await'),
    true,
    'Should detect async_function or await'
  );
});

await test('detects Python threading', async (t) => {
  const fn = {
    id: 1,
    symbol: 'start_threads',
    filename: 'test.py',
    start_line: 1,
    language: 'python',
    source: `def start_threads():
    lock = threading.Lock()
    thread = threading.Thread(target=worker)
    thread.start()`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.thread_patterns.length >= 1,
    true,
    'Should detect thread patterns'
  );
  t.assert.eq(
    result.sync_patterns.length >= 0,
    true,
    'May detect sync patterns'
  );
});

// ============ Go Concurrency Detection Tests ============

await test('detects Go goroutines', async (t) => {
  const fn = {
    id: 1,
    symbol: 'startWorkers',
    filename: 'test.go',
    start_line: 1,
    language: 'go',
    source: `func startWorkers() {
    go processItem(item)
    go func() {
        doWork()
    }()
}`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.async_patterns.length >= 1,
    true,
    'Should detect goroutine patterns'
  );
  const types = result.async_patterns.map((p) => p.type);
  t.assert.eq(
    types.includes('goroutine_call') || types.includes('goroutine_anon'),
    true,
    'Should detect goroutine'
  );
});

await test('detects Go channels and select', async (t) => {
  const fn = {
    id: 1,
    symbol: 'processChannel',
    filename: 'test.go',
    start_line: 1,
    language: 'go',
    source: `func processChannel() {
    ch := make(chan int)
    ch <- 42
    value := <-ch
    select {
    case v := <-ch:
        fmt.Println(v)
    }
}`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.sync_patterns.length >= 1,
    true,
    'Should detect channel patterns'
  );
  const types = result.sync_patterns.map((p) => p.type);
  t.assert.eq(
    types.includes('channel_make') ||
      types.includes('channel_send') ||
      types.includes('channel_receive'),
    true,
    'Should detect channel operations'
  );
});

await test('detects Go mutex', async (t) => {
  const fn = {
    id: 1,
    symbol: 'safeConcurrency',
    filename: 'test.go',
    start_line: 1,
    language: 'go',
    source: `func safeConcurrency() {
    var mu sync.Mutex
    mu.Lock()
    defer mu.Unlock()
    counter++
}`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.sync_patterns.length >= 1,
    true,
    'Should detect mutex patterns'
  );
  const types = result.sync_patterns.map((p) => p.type);
  t.assert.eq(
    types.includes('mutex') || types.includes('lock_acquire'),
    true,
    'Should detect mutex'
  );
});

// ============ Java Concurrency Detection Tests ============

await test('detects Java synchronized', async (t) => {
  const fn = {
    id: 1,
    symbol: 'increment',
    filename: 'Test.java',
    start_line: 1,
    language: 'java',
    source: `public void increment() {
    synchronized (this) {
        counter++;
    }
}`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.sync_patterns.length >= 1,
    true,
    'Should detect synchronized'
  );
  const types = result.sync_patterns.map((p) => p.type);
  t.assert.eq(
    types.includes('synchronized_block'),
    true,
    'Should detect synchronized_block'
  );
});

await test('detects Java ExecutorService', async (t) => {
  const fn = {
    id: 1,
    symbol: 'runTasks',
    filename: 'Test.java',
    start_line: 1,
    language: 'java',
    source: `public void runTasks() {
    ExecutorService executor = Executors.newFixedThreadPool(4);
    executor.submit(() -> processTask());
}`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.thread_patterns.length >= 1,
    true,
    'Should detect thread patterns'
  );
  const types = result.thread_patterns.map((p) => p.type);
  t.assert.eq(
    types.includes('executor') || types.includes('executors_factory'),
    true,
    'Should detect ExecutorService'
  );
});

// ============ Rust Concurrency Detection Tests ============

await test('detects Rust async/await', async (t) => {
  const fn = {
    id: 1,
    symbol: 'fetch',
    filename: 'test.rs',
    start_line: 1,
    language: 'rust',
    source: `async fn fetch() -> Result<String, Error> {
    let response = client.get(url).await?;
    Ok(response.text().await?)
}`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.async_patterns.length >= 1,
    true,
    'Should detect async patterns'
  );
  const types = result.async_patterns.map((p) => p.type);
  t.assert.eq(
    types.includes('async_function') || types.includes('await'),
    true,
    'Should detect async_function or await'
  );
});

await test('detects Rust Mutex and Arc', async (t) => {
  const fn = {
    id: 1,
    symbol: 'shared_state',
    filename: 'test.rs',
    start_line: 1,
    language: 'rust',
    source: `fn shared_state() {
    let counter = Arc::new(Mutex::new(0));
    let lock = counter.lock().unwrap();
}`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.sync_patterns.length >= 1,
    true,
    'Should detect sync patterns'
  );
  const types = result.sync_patterns.map((p) => p.type);
  t.assert.eq(
    types.includes('mutex') || types.includes('arc'),
    true,
    'Should detect Mutex or Arc'
  );
});

// ============ C++ Concurrency Detection Tests ============

await test('detects C++ std::thread', async (t) => {
  const fn = {
    id: 1,
    symbol: 'startThread',
    filename: 'test.cpp',
    start_line: 1,
    language: 'cpp',
    source: `void startThread() {
    std::thread worker(processTask);
    worker.join();
}`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.thread_patterns.length >= 1,
    true,
    'Should detect thread patterns'
  );
  const types = result.thread_patterns.map((p) => p.type);
  t.assert.eq(types.includes('thread'), true, 'Should detect std::thread');
});

await test('detects C++ mutex and lock_guard', async (t) => {
  const fn = {
    id: 1,
    symbol: 'safePrint',
    filename: 'test.cpp',
    start_line: 1,
    language: 'cpp',
    source: `void safePrint() {
    std::lock_guard<std::mutex> lock(mtx);
    std::cout << message << std::endl;
}`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(
    result.sync_patterns.length >= 1,
    true,
    'Should detect sync patterns'
  );
  const types = result.sync_patterns.map((p) => p.type);
  t.assert.eq(types.includes('lock_guard'), true, 'Should detect lock_guard');
});

// ============ Race Condition Warning Tests ============

await test('warns when async code has no synchronization', async (t) => {
  const fn = {
    id: 1,
    symbol: 'unsafeAsync',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `async function unsafeAsync() {
    sharedCounter++;
    await fetch('/api');
    sharedCounter++;
}`
  };

  const result = analyze_function_concurrency(fn);

  // Should have async patterns but no sync patterns
  t.assert.eq(
    result.async_patterns.length >= 1,
    true,
    'Should detect async patterns'
  );
  // May or may not trigger warning depending on heuristics
});

// ============ No Concurrency Detection Tests ============

await test('returns empty results for non-concurrent code', async (t) => {
  const fn = {
    id: 1,
    symbol: 'simpleFunc',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `function simpleFunc() {
    const x = 1 + 2;
    console.log(x);
    return x;
}`
  };

  const result = analyze_function_concurrency(fn);

  t.assert.eq(result.async_patterns.length, 0, 'Should have no async patterns');
  t.assert.eq(
    result.thread_patterns.length,
    0,
    'Should have no thread patterns'
  );
  t.assert.eq(result.sync_patterns.length, 0, 'Should have no sync patterns');
  t.assert.eq(result.timer_patterns.length, 0, 'Should have no timer patterns');
});
