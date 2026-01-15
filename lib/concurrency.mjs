'use strict';

/**
 * @fileoverview Concurrency analysis module.
 * Detects async/await patterns, threads, locks, and potential race conditions.
 * Computed on-demand from source code - no database changes required.
 * @module lib/concurrency
 */

import { query } from './db.mjs';

/**
 * Language-specific concurrency patterns to detect.
 */
const CONCURRENCY_PATTERNS = {
  javascript: {
    async_patterns: [
      { pattern: /\basync\s+function\b/, type: 'async_function', description: 'Async function declaration' },
      { pattern: /\basync\s*\(/, type: 'async_arrow', description: 'Async arrow function' },
      { pattern: /\bawait\s+/, type: 'await', description: 'Await expression' },
      { pattern: /\.then\s*\(/, type: 'promise_then', description: 'Promise .then()' },
      { pattern: /\.catch\s*\(/, type: 'promise_catch', description: 'Promise .catch()' },
      { pattern: /\.finally\s*\(/, type: 'promise_finally', description: 'Promise .finally()' },
      { pattern: /\bPromise\.(all|race|allSettled|any)\s*\(/, type: 'promise_combinator', description: 'Promise combinator' },
      { pattern: /new\s+Promise\s*\(/, type: 'promise_constructor', description: 'Promise constructor' }
    ],
    thread_patterns: [
      { pattern: /new\s+Worker\s*\(/, type: 'web_worker', description: 'Web Worker' },
      { pattern: /\bpostMessage\s*\(/, type: 'worker_message', description: 'Worker message passing' },
      { pattern: /\bonmessage\s*=/, type: 'worker_handler', description: 'Worker message handler' }
    ],
    sync_patterns: [
      { pattern: /\bAtomics\.(wait|notify|waitAsync)\s*\(/, type: 'atomics', description: 'Atomics synchronization' },
      { pattern: /new\s+SharedArrayBuffer\s*\(/, type: 'shared_buffer', description: 'SharedArrayBuffer' }
    ],
    timer_patterns: [
      { pattern: /\bsetTimeout\s*\(/, type: 'setTimeout', description: 'setTimeout callback' },
      { pattern: /\bsetInterval\s*\(/, type: 'setInterval', description: 'setInterval callback' },
      { pattern: /\bsetImmediate\s*\(/, type: 'setImmediate', description: 'setImmediate callback' },
      { pattern: /\bprocess\.nextTick\s*\(/, type: 'nextTick', description: 'process.nextTick callback' }
    ]
  },

  typescript: {
    // TypeScript inherits JavaScript patterns
    async_patterns: [
      { pattern: /\basync\s+function\b/, type: 'async_function', description: 'Async function declaration' },
      { pattern: /\basync\s*\(/, type: 'async_arrow', description: 'Async arrow function' },
      { pattern: /\bawait\s+/, type: 'await', description: 'Await expression' },
      { pattern: /\.then\s*\(/, type: 'promise_then', description: 'Promise .then()' },
      { pattern: /\.catch\s*\(/, type: 'promise_catch', description: 'Promise .catch()' },
      { pattern: /\.finally\s*\(/, type: 'promise_finally', description: 'Promise .finally()' },
      { pattern: /\bPromise\.(all|race|allSettled|any)\s*\(/, type: 'promise_combinator', description: 'Promise combinator' },
      { pattern: /new\s+Promise\s*\(/, type: 'promise_constructor', description: 'Promise constructor' },
      { pattern: /Promise</, type: 'promise_type', description: 'Promise type annotation' }
    ],
    thread_patterns: [
      { pattern: /new\s+Worker\s*\(/, type: 'web_worker', description: 'Web Worker' },
      { pattern: /\bpostMessage\s*\(/, type: 'worker_message', description: 'Worker message passing' }
    ],
    sync_patterns: [
      { pattern: /\bAtomics\.(wait|notify|waitAsync)\s*\(/, type: 'atomics', description: 'Atomics synchronization' },
      { pattern: /new\s+SharedArrayBuffer\s*\(/, type: 'shared_buffer', description: 'SharedArrayBuffer' }
    ],
    timer_patterns: [
      { pattern: /\bsetTimeout\s*\(/, type: 'setTimeout', description: 'setTimeout callback' },
      { pattern: /\bsetInterval\s*\(/, type: 'setInterval', description: 'setInterval callback' }
    ]
  },

  python: {
    async_patterns: [
      { pattern: /\basync\s+def\b/, type: 'async_function', description: 'Async function definition' },
      { pattern: /\bawait\s+/, type: 'await', description: 'Await expression' },
      { pattern: /\basyncio\./, type: 'asyncio', description: 'asyncio module usage' },
      { pattern: /\basync\s+for\b/, type: 'async_for', description: 'Async for loop' },
      { pattern: /\basync\s+with\b/, type: 'async_with', description: 'Async context manager' }
    ],
    thread_patterns: [
      { pattern: /\bthreading\.Thread\b/, type: 'thread', description: 'Thread creation' },
      { pattern: /\bthreading\.Lock\b/, type: 'lock', description: 'Thread lock' },
      { pattern: /\bthreading\.RLock\b/, type: 'rlock', description: 'Reentrant lock' },
      { pattern: /\bthreading\.Semaphore\b/, type: 'semaphore', description: 'Semaphore' },
      { pattern: /\bthreading\.Event\b/, type: 'event', description: 'Thread event' },
      { pattern: /\bthreading\.Condition\b/, type: 'condition', description: 'Condition variable' },
      { pattern: /\bthreading\.Barrier\b/, type: 'barrier', description: 'Thread barrier' },
      { pattern: /\bmultiprocessing\.Process\b/, type: 'process', description: 'Multiprocessing process' },
      { pattern: /\bmultiprocessing\.Pool\b/, type: 'process_pool', description: 'Process pool' },
      { pattern: /\bconcurrent\.futures\./, type: 'futures', description: 'Concurrent futures' }
    ],
    sync_patterns: [
      { pattern: /\.acquire\s*\(/, type: 'lock_acquire', description: 'Lock acquisition' },
      { pattern: /\.release\s*\(/, type: 'lock_release', description: 'Lock release' },
      { pattern: /\bwith\s+.*lock/, type: 'lock_context', description: 'Lock context manager' }
    ],
    timer_patterns: []
  },

  java: {
    async_patterns: [
      { pattern: /\bCompletableFuture\b/, type: 'completable_future', description: 'CompletableFuture' },
      { pattern: /\.thenApply\s*\(/, type: 'then_apply', description: 'thenApply callback' },
      { pattern: /\.thenAccept\s*\(/, type: 'then_accept', description: 'thenAccept callback' },
      { pattern: /\.thenCompose\s*\(/, type: 'then_compose', description: 'thenCompose callback' },
      { pattern: /\bFuture</, type: 'future', description: 'Future type' }
    ],
    thread_patterns: [
      { pattern: /new\s+Thread\s*\(/, type: 'thread', description: 'Thread creation' },
      { pattern: /\bRunnable\b/, type: 'runnable', description: 'Runnable interface' },
      { pattern: /\bCallable\b/, type: 'callable', description: 'Callable interface' },
      { pattern: /\bExecutorService\b/, type: 'executor', description: 'ExecutorService' },
      { pattern: /\bThreadPoolExecutor\b/, type: 'thread_pool', description: 'Thread pool executor' },
      { pattern: /\bExecutors\./, type: 'executors_factory', description: 'Executors factory' }
    ],
    sync_patterns: [
      { pattern: /\bsynchronized\s*\(/, type: 'synchronized_block', description: 'Synchronized block' },
      { pattern: /\bsynchronized\s+\w+\s*\(/, type: 'synchronized_method', description: 'Synchronized method' },
      { pattern: /\bReentrantLock\b/, type: 'reentrant_lock', description: 'ReentrantLock' },
      { pattern: /\bSemaphore\b/, type: 'semaphore', description: 'Semaphore' },
      { pattern: /\bCountDownLatch\b/, type: 'countdown_latch', description: 'CountDownLatch' },
      { pattern: /\bCyclicBarrier\b/, type: 'cyclic_barrier', description: 'CyclicBarrier' },
      { pattern: /\bvolatile\s+/, type: 'volatile', description: 'Volatile field' },
      { pattern: /\bAtomicInteger\b|\bAtomicLong\b|\bAtomicBoolean\b|\bAtomicReference\b/, type: 'atomic', description: 'Atomic types' },
      { pattern: /\.lock\s*\(/, type: 'lock_acquire', description: 'Lock acquisition' },
      { pattern: /\.unlock\s*\(/, type: 'lock_release', description: 'Lock release' }
    ],
    timer_patterns: [
      { pattern: /\bTimer\b/, type: 'timer', description: 'Timer' },
      { pattern: /\bScheduledExecutorService\b/, type: 'scheduled_executor', description: 'Scheduled executor' }
    ]
  },

  csharp: {
    async_patterns: [
      { pattern: /\basync\s+Task/, type: 'async_task', description: 'Async Task method' },
      { pattern: /\bawait\s+/, type: 'await', description: 'Await expression' },
      { pattern: /\bTask\.Run\s*\(/, type: 'task_run', description: 'Task.Run' },
      { pattern: /\bTask\.WhenAll\s*\(/, type: 'task_when_all', description: 'Task.WhenAll' },
      { pattern: /\bTask\.WhenAny\s*\(/, type: 'task_when_any', description: 'Task.WhenAny' },
      { pattern: /\bValueTask\b/, type: 'value_task', description: 'ValueTask' }
    ],
    thread_patterns: [
      { pattern: /new\s+Thread\s*\(/, type: 'thread', description: 'Thread creation' },
      { pattern: /\bThreadPool\./, type: 'thread_pool', description: 'ThreadPool' },
      { pattern: /\bParallel\.(For|ForEach|Invoke)\s*\(/, type: 'parallel', description: 'Parallel operations' }
    ],
    sync_patterns: [
      { pattern: /\block\s*\(/, type: 'lock', description: 'Lock statement' },
      { pattern: /\bMonitor\.(Enter|Exit)\s*\(/, type: 'monitor', description: 'Monitor synchronization' },
      { pattern: /\bMutex\b/, type: 'mutex', description: 'Mutex' },
      { pattern: /\bSemaphore(Slim)?\b/, type: 'semaphore', description: 'Semaphore' },
      { pattern: /\bvolatile\s+/, type: 'volatile', description: 'Volatile field' },
      { pattern: /\bInterlocked\./, type: 'interlocked', description: 'Interlocked operations' }
    ],
    timer_patterns: [
      { pattern: /\bTimer\b/, type: 'timer', description: 'Timer' }
    ]
  },

  go: {
    async_patterns: [
      { pattern: /\bgo\s+\w+\s*\(/, type: 'goroutine_call', description: 'Goroutine function call' },
      { pattern: /\bgo\s+func\s*\(/, type: 'goroutine_anon', description: 'Anonymous goroutine' }
    ],
    thread_patterns: [],  // Go doesn't use OS threads directly
    sync_patterns: [
      { pattern: /\bchan\s+/, type: 'channel', description: 'Channel declaration' },
      { pattern: /\bmake\s*\(\s*chan\b/, type: 'channel_make', description: 'Channel creation' },
      { pattern: /<-\s*\w+/, type: 'channel_receive', description: 'Channel receive' },
      { pattern: /\w+\s*<-/, type: 'channel_send', description: 'Channel send' },
      { pattern: /\bselect\s*\{/, type: 'select', description: 'Select statement' },
      { pattern: /\bsync\.Mutex\b/, type: 'mutex', description: 'Mutex' },
      { pattern: /\bsync\.RWMutex\b/, type: 'rwmutex', description: 'Read-write mutex' },
      { pattern: /\bsync\.WaitGroup\b/, type: 'waitgroup', description: 'WaitGroup' },
      { pattern: /\bsync\.Once\b/, type: 'once', description: 'Sync.Once' },
      { pattern: /\bsync\.Cond\b/, type: 'cond', description: 'Condition variable' },
      { pattern: /\bsync\.Map\b/, type: 'sync_map', description: 'Concurrent map' },
      { pattern: /\batomic\./, type: 'atomic', description: 'Atomic operations' },
      { pattern: /\.Lock\s*\(/, type: 'lock_acquire', description: 'Lock acquisition' },
      { pattern: /\.Unlock\s*\(/, type: 'lock_release', description: 'Lock release' },
      { pattern: /\.RLock\s*\(/, type: 'rlock_acquire', description: 'Read lock acquisition' },
      { pattern: /\.RUnlock\s*\(/, type: 'rlock_release', description: 'Read lock release' }
    ],
    timer_patterns: [
      { pattern: /\btime\.After\s*\(/, type: 'timer_after', description: 'time.After' },
      { pattern: /\btime\.Tick\s*\(/, type: 'timer_tick', description: 'time.Tick' },
      { pattern: /\btime\.NewTimer\s*\(/, type: 'timer_new', description: 'time.NewTimer' }
    ]
  },

  rust: {
    async_patterns: [
      { pattern: /\basync\s+fn\b/, type: 'async_function', description: 'Async function' },
      { pattern: /\.await\b/, type: 'await', description: 'Await expression' },
      { pattern: /\btokio::/, type: 'tokio', description: 'Tokio runtime' },
      { pattern: /\basync_std::/, type: 'async_std', description: 'async-std runtime' },
      { pattern: /\basync\s+move\b/, type: 'async_move', description: 'Async move block' }
    ],
    thread_patterns: [
      { pattern: /\bstd::thread::spawn\b/, type: 'thread_spawn', description: 'Thread spawn' },
      { pattern: /\bthread::spawn\s*\(/, type: 'thread_spawn_call', description: 'Thread spawn call' },
      { pattern: /\brayon::/, type: 'rayon', description: 'Rayon parallel iterator' }
    ],
    sync_patterns: [
      { pattern: /\bMutex(<|::new)/, type: 'mutex', description: 'Mutex' },
      { pattern: /\bRwLock(<|::new)/, type: 'rwlock', description: 'Read-write lock' },
      { pattern: /\bArc(<|::new)/, type: 'arc', description: 'Atomic reference counting' },
      { pattern: /\bAtomic\w+\b/, type: 'atomic', description: 'Atomic types' },
      { pattern: /\bmpsc::/, type: 'channel', description: 'MPSC channel' },
      { pattern: /\bcrossbeam::/, type: 'crossbeam', description: 'Crossbeam concurrency' },
      { pattern: /\.lock\s*\(\s*\)/, type: 'lock_acquire', description: 'Lock acquisition' },
      { pattern: /\.read\s*\(\s*\)/, type: 'rlock_acquire', description: 'Read lock acquisition' },
      { pattern: /\.write\s*\(\s*\)/, type: 'wlock_acquire', description: 'Write lock acquisition' }
    ],
    timer_patterns: []
  },

  cpp: {
    async_patterns: [
      { pattern: /\bstd::async\s*\(/, type: 'async', description: 'std::async' },
      { pattern: /\bstd::future</, type: 'future', description: 'std::future' },
      { pattern: /\bstd::promise</, type: 'promise', description: 'std::promise' },
      { pattern: /\bco_await\b/, type: 'co_await', description: 'Coroutine await' },
      { pattern: /\bco_return\b/, type: 'co_return', description: 'Coroutine return' },
      { pattern: /\bco_yield\b/, type: 'co_yield', description: 'Coroutine yield' }
    ],
    thread_patterns: [
      { pattern: /\bstd::thread\b/, type: 'thread', description: 'std::thread' },
      { pattern: /\bpthread_create\s*\(/, type: 'pthread_create', description: 'pthread_create' },
      { pattern: /\bpthread_join\s*\(/, type: 'pthread_join', description: 'pthread_join' }
    ],
    sync_patterns: [
      { pattern: /\bstd::mutex\b/, type: 'mutex', description: 'std::mutex' },
      { pattern: /\bstd::shared_mutex\b/, type: 'shared_mutex', description: 'std::shared_mutex' },
      { pattern: /\bstd::lock_guard</, type: 'lock_guard', description: 'Lock guard' },
      { pattern: /\bstd::unique_lock</, type: 'unique_lock', description: 'Unique lock' },
      { pattern: /\bstd::shared_lock</, type: 'shared_lock', description: 'Shared lock' },
      { pattern: /\bstd::condition_variable\b/, type: 'condition_variable', description: 'Condition variable' },
      { pattern: /\bstd::atomic</, type: 'atomic', description: 'Atomic type' },
      { pattern: /\bpthread_mutex_/, type: 'pthread_mutex', description: 'pthread mutex' },
      { pattern: /\bpthread_cond_/, type: 'pthread_cond', description: 'pthread condition' },
      { pattern: /\bstd::semaphore\b/, type: 'semaphore', description: 'std::semaphore' },
      { pattern: /\bstd::latch\b/, type: 'latch', description: 'std::latch' },
      { pattern: /\bstd::barrier\b/, type: 'barrier', description: 'std::barrier' }
    ],
    timer_patterns: []
  }
};

// Race condition warning patterns
const RACE_CONDITION_PATTERNS = [
  {
    id: 'shared_state_no_lock',
    description: 'Shared state access without apparent synchronization',
    // This is detected by having async/thread patterns but no sync patterns
    check: (findings) => {
      const hasAsync = findings.async_patterns.length > 0 || findings.thread_patterns.length > 0;
      const hasSync = findings.sync_patterns.length > 0;
      return hasAsync && !hasSync;
    },
    severity: 'warning'
  },
  {
    id: 'lock_not_released',
    description: 'Lock acquired but release not found in same function',
    check: (findings) => {
      const acquires = findings.sync_patterns.filter(p =>
        p.type === 'lock_acquire' || p.type === 'rlock_acquire'
      );
      const releases = findings.sync_patterns.filter(p =>
        p.type === 'lock_release' || p.type === 'rlock_release'
      );
      return acquires.length > releases.length;
    },
    severity: 'warning'
  }
];

/**
 * Analyze concurrency patterns in a single function.
 * @param {Object} fn - Function entity with source code
 * @returns {Object} Concurrency findings for the function
 */
const analyze_function_concurrency = (fn) => {
  const source = fn.source || '';
  const language = fn.language;
  const patterns = CONCURRENCY_PATTERNS[language] || CONCURRENCY_PATTERNS.javascript;

  const findings = {
    async_patterns: [],
    thread_patterns: [],
    sync_patterns: [],
    timer_patterns: [],
    warnings: []
  };

  // Check each pattern category
  const checkPatterns = (patternList, category) => {
    for (const p of patternList || []) {
      if (p.pattern.test(source)) {
        findings[category].push({
          type: p.type,
          description: p.description,
          function_id: fn.id,
          symbol: fn.symbol,
          filename: fn.filename,
          start_line: fn.start_line
        });
      }
    }
  };

  checkPatterns(patterns.async_patterns, 'async_patterns');
  checkPatterns(patterns.thread_patterns, 'thread_patterns');
  checkPatterns(patterns.sync_patterns, 'sync_patterns');
  checkPatterns(patterns.timer_patterns, 'timer_patterns');

  // Check for potential race conditions
  for (const racePattern of RACE_CONDITION_PATTERNS) {
    if (racePattern.check(findings)) {
      findings.warnings.push({
        id: racePattern.id,
        description: racePattern.description,
        severity: racePattern.severity,
        function_id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line
      });
    }
  }

  return findings;
};

/**
 * Analyze concurrency patterns across all functions in a project.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Concurrency analysis results
 */
const analyze_project_concurrency = async (project_id) => {
  const functions = await query`
    SELECT id, symbol, filename, start_line, end_line, source, language
    FROM entity
    WHERE project_id = ${project_id}
      AND type = 'function'
      AND source IS NOT NULL
    ORDER BY filename, start_line
  `;

  const results = {
    functions_with_concurrency: [],
    async_patterns: [],
    thread_patterns: [],
    sync_patterns: [],
    timer_patterns: [],
    warnings: [],
    by_file: {},
    by_language: {}
  };

  for (const fn of functions) {
    const findings = analyze_function_concurrency(fn);

    // Check if this function has any concurrency patterns
    const hasConcurrency =
      findings.async_patterns.length > 0 ||
      findings.thread_patterns.length > 0 ||
      findings.sync_patterns.length > 0 ||
      findings.timer_patterns.length > 0;

    if (hasConcurrency) {
      results.functions_with_concurrency.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        language: fn.language,
        pattern_counts: {
          async: findings.async_patterns.length,
          thread: findings.thread_patterns.length,
          sync: findings.sync_patterns.length,
          timer: findings.timer_patterns.length
        }
      });

      // Aggregate patterns
      results.async_patterns.push(...findings.async_patterns);
      results.thread_patterns.push(...findings.thread_patterns);
      results.sync_patterns.push(...findings.sync_patterns);
      results.timer_patterns.push(...findings.timer_patterns);
      results.warnings.push(...findings.warnings);

      // Group by file
      if (!results.by_file[fn.filename]) {
        results.by_file[fn.filename] = {
          functions: [],
          async_count: 0,
          thread_count: 0,
          sync_count: 0,
          timer_count: 0,
          warning_count: 0
        };
      }
      results.by_file[fn.filename].functions.push(fn.symbol);
      results.by_file[fn.filename].async_count += findings.async_patterns.length;
      results.by_file[fn.filename].thread_count += findings.thread_patterns.length;
      results.by_file[fn.filename].sync_count += findings.sync_patterns.length;
      results.by_file[fn.filename].timer_count += findings.timer_patterns.length;
      results.by_file[fn.filename].warning_count += findings.warnings.length;

      // Group by language
      if (!results.by_language[fn.language]) {
        results.by_language[fn.language] = {
          function_count: 0,
          async_count: 0,
          thread_count: 0,
          sync_count: 0,
          timer_count: 0
        };
      }
      results.by_language[fn.language].function_count++;
      results.by_language[fn.language].async_count += findings.async_patterns.length;
      results.by_language[fn.language].thread_count += findings.thread_patterns.length;
      results.by_language[fn.language].sync_count += findings.sync_patterns.length;
      results.by_language[fn.language].timer_count += findings.timer_patterns.length;
    }
  }

  // Calculate summary
  results.summary = {
    functions_analyzed: functions.length,
    functions_with_concurrency: results.functions_with_concurrency.length,
    concurrency_percentage: functions.length > 0
      ? Math.round((results.functions_with_concurrency.length / functions.length) * 100 * 10) / 10
      : 0,
    total_async_patterns: results.async_patterns.length,
    total_thread_patterns: results.thread_patterns.length,
    total_sync_patterns: results.sync_patterns.length,
    total_timer_patterns: results.timer_patterns.length,
    total_warnings: results.warnings.length,
    files_with_concurrency: Object.keys(results.by_file).length,
    languages: Object.keys(results.by_language)
  };

  // Group patterns by type for easier analysis
  const groupByType = (patterns) => {
    const grouped = {};
    for (const p of patterns) {
      if (!grouped[p.type]) {
        grouped[p.type] = {
          type: p.type,
          description: p.description,
          count: 0,
          locations: []
        };
      }
      grouped[p.type].count++;
      grouped[p.type].locations.push({
        symbol: p.symbol,
        filename: p.filename,
        line: p.start_line
      });
    }
    return Object.values(grouped).sort((a, b) => b.count - a.count);
  };

  results.async_patterns_grouped = groupByType(results.async_patterns);
  results.thread_patterns_grouped = groupByType(results.thread_patterns);
  results.sync_patterns_grouped = groupByType(results.sync_patterns);
  results.timer_patterns_grouped = groupByType(results.timer_patterns);

  return results;
};

export {
  analyze_project_concurrency,
  analyze_function_concurrency,
  CONCURRENCY_PATTERNS
};
