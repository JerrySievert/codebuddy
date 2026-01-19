'use strict';

/**
 * @fileoverview Tests for resource analysis module.
 * Tests pattern detection for memory allocation, file handles, and resource leaks.
 */

import { test } from 'st';
import { query } from '../../../lib/db.mjs';
import { insert_or_update_project } from '../../../lib/model/project.mjs';
import { insert_or_update_entity } from '../../../lib/model/entity.mjs';
import {
  analyze_function_resources,
  analyze_project_resources,
  RESOURCE_PATTERNS
} from '../../../lib/analysis/resources.mjs';

// Counter to ensure unique project names
let test_counter = 0;

/**
 * Clean up any leftover test projects from previous runs.
 */
const cleanup_all_test_projects = async () => {
  const projects =
    await query`SELECT id FROM project WHERE name LIKE '_test_resources_%'`;
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
  const project_name = `_test_resources_${test_id}_${Date.now()}`;

  const project_result = await insert_or_update_project({
    name: project_name,
    path: `/tmp/test_resources_${test_id}`
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

// ============ RESOURCE_PATTERNS structure tests ============

await test('RESOURCE_PATTERNS has patterns for C', (t) => {
  const c = RESOURCE_PATTERNS.c;
  t.assert.ok(c, 'Should have C patterns');
  t.assert.ok(c.memory, 'Should have memory patterns');
  t.assert.ok(c.file, 'Should have file patterns');
  t.assert.ok(c.network, 'Should have network patterns');
});

await test('RESOURCE_PATTERNS has patterns for C++', (t) => {
  const cpp = RESOURCE_PATTERNS.cpp;
  t.assert.ok(cpp, 'Should have C++ patterns');
  t.assert.ok(cpp.memory, 'Should have memory patterns');
  t.assert.ok(cpp.smart_pointers, 'Should have smart_pointers patterns');
  t.assert.ok(cpp.lock, 'Should have lock patterns');
});

await test('RESOURCE_PATTERNS has patterns for JavaScript', (t) => {
  const js = RESOURCE_PATTERNS.javascript;
  t.assert.ok(js, 'Should have JavaScript patterns');
  t.assert.ok(js.timer, 'Should have timer patterns');
  t.assert.ok(js.event, 'Should have event patterns');
  t.assert.ok(js.stream, 'Should have stream patterns');
});

await test('RESOURCE_PATTERNS has patterns for Python', (t) => {
  const py = RESOURCE_PATTERNS.python;
  t.assert.ok(py, 'Should have Python patterns');
  t.assert.ok(py.file, 'Should have file patterns');
  t.assert.ok(py.context_manager, 'Should have context_manager patterns');
  t.assert.ok(py.database, 'Should have database patterns');
});

await test('RESOURCE_PATTERNS has patterns for Go', (t) => {
  const go = RESOURCE_PATTERNS.go;
  t.assert.ok(go, 'Should have Go patterns');
  t.assert.ok(go.defer, 'Should have defer patterns');
  t.assert.ok(go.file, 'Should have file patterns');
  t.assert.ok(go.network, 'Should have network patterns');
});

await test('RESOURCE_PATTERNS has patterns for Rust', (t) => {
  const rust = RESOURCE_PATTERNS.rust;
  t.assert.ok(rust, 'Should have Rust patterns');
  t.assert.ok(rust.ownership, 'Should have ownership patterns');
  t.assert.ok(rust.unsafe_memory, 'Should have unsafe_memory patterns');
});

// ============ analyze_function_resources tests (C) ============

await test('analyze_function_resources detects C malloc/free', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_malloc',
    filename: 'test.c',
    start_line: 1,
    language: 'c',
    source: `
      void* test_malloc() {
        void* ptr = malloc(100);
        // ... use ptr ...
        free(ptr);
        return NULL;
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.acquisitions.length > 0, 'Should detect allocation');
  t.assert.ok(result.releases.length > 0, 'Should detect free');

  const acq_names = result.acquisitions.map((a) => a.name);
  t.assert.ok(acq_names.includes('malloc/free'), 'Should detect malloc');

  const rel_names = result.releases.map((r) => r.name);
  t.assert.ok(rel_names.includes('malloc/free'), 'Should detect free');
});

await test('analyze_function_resources detects C file handles', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_file',
    filename: 'test.c',
    start_line: 1,
    language: 'c',
    source: `
      void test_file() {
        FILE* f = fopen("data.txt", "r");
        // ... read file ...
        fclose(f);
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.acquisitions.length > 0, 'Should detect file open');
  t.assert.ok(result.releases.length > 0, 'Should detect file close');
});

await test('analyze_function_resources detects potential leak in C', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_leak',
    filename: 'test.c',
    start_line: 1,
    language: 'c',
    source: `
      void test_leak() {
        void* ptr = malloc(100);
        // Missing free!
        return;
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.acquisitions.length > 0, 'Should detect allocation');
  t.assert.ok(result.potential_leaks.length > 0, 'Should detect potential leak');
  t.assert.ok(
    result.potential_leaks[0].description.includes('release not found'),
    'Leak description should mention missing release'
  );
});

await test('analyze_function_resources warns about malloc without null check', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_no_null_check',
    filename: 'test.c',
    start_line: 1,
    language: 'c',
    source: `
      void test_no_null_check() {
        char* str = malloc(100);
        strcpy(str, "hello");  // No null check!
        free(str);
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.warnings.length > 0, 'Should have warnings');
  t.assert.ok(
    result.warnings.some((w) => w.id === 'malloc_no_null_check'),
    'Should warn about missing null check'
  );
});

// ============ analyze_function_resources tests (C++) ============

await test('analyze_function_resources detects C++ smart pointers', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_smart_ptr',
    filename: 'test.cpp',
    start_line: 1,
    language: 'cpp',
    source: `
      void test_smart_ptr() {
        auto ptr = std::make_unique<MyClass>();
        auto shared = std::make_shared<Other>();
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.safe_patterns.length > 0, 'Should detect safe patterns');
  const names = result.safe_patterns.map((p) => p.name);
  t.assert.ok(names.includes('make_unique'), 'Should detect make_unique');
  t.assert.ok(names.includes('make_shared'), 'Should detect make_shared');
});

await test('analyze_function_resources detects C++ RAII locks', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_lock',
    filename: 'test.cpp',
    start_line: 1,
    language: 'cpp',
    source: `
      void test_lock() {
        std::lock_guard<std::mutex> lock(mtx);
        // critical section
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.safe_patterns.length > 0, 'Should detect safe patterns');
  const names = result.safe_patterns.map((p) => p.name);
  t.assert.ok(names.includes('lock_guard'), 'Should detect lock_guard');
});

await test('analyze_function_resources warns about raw new in C++', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_raw_new',
    filename: 'test.cpp',
    start_line: 1,
    language: 'cpp',
    source: `
      void test_raw_new() {
        MyClass* obj = new MyClass();
        // No smart pointer!
        delete obj;
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.warnings.length > 0, 'Should have warnings');
  t.assert.ok(
    result.warnings.some((w) => w.id === 'raw_new_without_smart_ptr'),
    'Should warn about raw new'
  );
});

// ============ analyze_function_resources tests (JavaScript) ============

await test('analyze_function_resources detects JS timers', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_timers',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `
      function test_timers() {
        const id = setTimeout(() => {}, 1000);
        clearTimeout(id);
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.acquisitions.length > 0, 'Should detect setTimeout');
  t.assert.ok(result.releases.length > 0, 'Should detect clearTimeout');
});

await test('analyze_function_resources detects JS event listeners', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_events',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `
      function test_events() {
        element.addEventListener('click', handler);
        // Later...
        element.removeEventListener('click', handler);
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.acquisitions.length > 0, 'Should detect addEventListener');
  t.assert.ok(result.releases.length > 0, 'Should detect removeEventListener');
});

// ============ analyze_function_resources tests (Python) ============

await test('analyze_function_resources detects Python with statement as safe', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_with',
    filename: 'test.py',
    start_line: 1,
    language: 'python',
    source: `
      def test_with():
          with open("file.txt") as f:
              data = f.read()
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.safe_patterns.length > 0, 'Should detect safe patterns');
  const names = result.safe_patterns.map((p) => p.name);
  t.assert.ok(names.includes('with statement'), 'Should detect with statement');
});

await test('analyze_function_resources detects Python file without with', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_file_no_with',
    filename: 'test.py',
    start_line: 1,
    language: 'python',
    source: `
      def test_file_no_with():
          f = open("file.txt")
          data = f.read()
          f.close()
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.acquisitions.length > 0, 'Should detect open');
  t.assert.ok(result.releases.length > 0, 'Should detect close');
});

// ============ analyze_function_resources tests (Go) ============

await test('analyze_function_resources detects Go defer as safe', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_defer',
    filename: 'test.go',
    start_line: 1,
    language: 'go',
    source: `
      func test_defer() {
          f, _ := os.Open("file.txt")
          defer f.Close()
          // ...
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.safe_patterns.length > 0, 'Should detect safe patterns');
  const names = result.safe_patterns.map((p) => p.name);
  t.assert.ok(names.includes('defer statement'), 'Should detect defer');
});

await test('analyze_function_resources detects Go HTTP response body', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_http',
    filename: 'test.go',
    start_line: 1,
    language: 'go',
    source: `
      func test_http() {
          resp, _ := http.Get("http://example.com")
          defer resp.Body.Close()
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.acquisitions.length > 0, 'Should detect http.Get');
  // defer should make it safe
  t.assert.ok(result.safe_patterns.length > 0, 'Defer makes it safe');
});

// ============ analyze_function_resources tests (Rust) ============

await test('analyze_function_resources detects Rust ownership types as safe', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_rust_ownership',
    filename: 'test.rs',
    start_line: 1,
    language: 'rust',
    source: `
      fn test_rust_ownership() {
          let boxed = Box::new(value);
          let rc = Rc::new(shared);
          let arc = Arc::new(thread_safe);
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.safe_patterns.length > 0, 'Should detect safe patterns');
  const names = result.safe_patterns.map((p) => p.name);
  t.assert.ok(names.includes('Box'), 'Should detect Box');
  t.assert.ok(names.includes('Rc'), 'Should detect Rc');
  t.assert.ok(names.includes('Arc'), 'Should detect Arc');
});

await test('analyze_function_resources detects Rust File as safe (RAII)', (t) => {
  const fn = {
    id: 1,
    symbol: 'test_rust_file',
    filename: 'test.rs',
    start_line: 1,
    language: 'rust',
    source: `
      fn test_rust_file() -> Result<()> {
          let file = File::open("data.txt")?;
          // RAII handles cleanup
      }
    `
  };

  const result = analyze_function_resources(fn);

  t.assert.ok(result.safe_patterns.length > 0, 'Should detect safe patterns');
  const names = result.safe_patterns.map((p) => p.name);
  t.assert.ok(names.includes('File::open'), 'Should detect File::open as safe');
});

// ============ analyze_function_resources edge cases ============

await test('analyze_function_resources handles empty source', (t) => {
  const fn = {
    id: 1,
    symbol: 'empty_func',
    filename: 'test.c',
    start_line: 1,
    language: 'c',
    source: ''
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length, 0, 'Should have no acquisitions');
  t.assert.eq(result.releases.length, 0, 'Should have no releases');
  t.assert.eq(result.potential_leaks.length, 0, 'Should have no leaks');
});

await test('analyze_function_resources handles unknown language', (t) => {
  const fn = {
    id: 1,
    symbol: 'unknown_func',
    filename: 'test.xyz',
    start_line: 1,
    language: 'unknown_language',
    source: 'some code here'
  };

  const result = analyze_function_resources(fn);

  // Should not throw, just return empty results
  t.assert.ok(result, 'Should return result');
  t.assert.eq(result.acquisitions.length, 0, 'Should have no acquisitions');
});

// ============ analyze_project_resources tests ============

await test('analyze_project_resources analyzes all functions', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    await insert_or_update_entity({
      project_id,
      symbol: 'alloc_func',
      type: 'function',
      filename: 'memory.c',
      language: 'c',
      start_line: 1,
      end_line: 10,
      parameters: '',
      return_type: 'void*',
      source: 'void* alloc_func() { return malloc(100); }',
      comment: null
    });

    await insert_or_update_entity({
      project_id,
      symbol: 'simple_func',
      type: 'function',
      filename: 'simple.c',
      language: 'c',
      start_line: 1,
      end_line: 3,
      parameters: '',
      return_type: 'int',
      source: 'int simple_func() { return 42; }',
      comment: null
    });

    const result = await analyze_project_resources(project_id);

    t.assert.ok(result.summary, 'Should have summary');
    t.assert.eq(
      result.summary.functions_analyzed,
      2,
      'Should analyze 2 functions'
    );
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('analyze_project_resources groups by category', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    await insert_or_update_entity({
      project_id,
      symbol: 'mixed_resources',
      type: 'function',
      filename: 'mixed.c',
      language: 'c',
      start_line: 1,
      end_line: 20,
      parameters: '',
      return_type: 'void',
      source: `
        void mixed_resources() {
          void* mem = malloc(100);
          FILE* f = fopen("data.txt", "r");
          free(mem);
          fclose(f);
        }
      `,
      comment: null
    });

    const result = await analyze_project_resources(project_id);

    t.assert.ok(result.by_category, 'Should have by_category grouping');
    t.assert.ok(result.by_category.memory, 'Should have memory category');
    t.assert.ok(result.by_category.file, 'Should have file category');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

await test('analyze_project_resources calculates summary stats', async (t) => {
  let project_id;
  try {
    project_id = await setup_test_project();

    await insert_or_update_entity({
      project_id,
      symbol: 'leaky_func',
      type: 'function',
      filename: 'leak.c',
      language: 'c',
      start_line: 1,
      end_line: 5,
      parameters: '',
      return_type: 'void',
      source: 'void leaky_func() { malloc(100); }',
      comment: null
    });

    const result = await analyze_project_resources(project_id);

    t.assert.ok(result.summary.total_acquisitions >= 1, 'Should count acquisitions');
    t.assert.ok(result.summary.total_potential_leaks >= 1, 'Should count potential leaks');
    t.assert.ok(result.summary.files_with_resources >= 1, 'Should count files');
  } finally {
    await cleanup_test_fixtures(project_id);
  }
});

// Final cleanup
await cleanup_all_test_projects();
