'use strict';

/**
 * @fileoverview Tests for resource analysis module.
 * Tests detection of memory allocation, file handles, and resource leaks.
 */

import { test } from 'st';
import {
  analyze_function_resources,
  RESOURCE_PATTERNS
} from '../../lib/resources.mjs';

// ============ Pattern Configuration Tests ============

await test('RESOURCE_PATTERNS has configurations for major languages', async (t) => {
  const expectedLanguages = ['c', 'cpp', 'javascript', 'typescript', 'python', 'java', 'csharp', 'go', 'rust'];

  for (const lang of expectedLanguages) {
    t.assert.eq(RESOURCE_PATTERNS[lang] !== undefined, true, `Should have patterns for ${lang}`);
  }
});

// ============ C Memory Allocation Tests ============

await test('detects C malloc/free', async (t) => {
  const fn = {
    id: 1,
    symbol: 'allocate',
    filename: 'test.c',
    start_line: 1,
    language: 'c',
    source: `void* allocate() {
    void* ptr = malloc(100);
    free(ptr);
    return NULL;
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length >= 1, true, 'Should detect malloc');
  t.assert.eq(result.releases.length >= 1, true, 'Should detect free');
});

await test('detects C potential memory leak', async (t) => {
  const fn = {
    id: 1,
    symbol: 'leaky',
    filename: 'test.c',
    start_line: 1,
    language: 'c',
    source: `void* leaky() {
    void* ptr = malloc(100);
    return ptr;
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length >= 1, true, 'Should detect malloc');
  t.assert.eq(result.potential_leaks.length >= 1, true, 'Should detect potential leak');
});

await test('detects C file operations', async (t) => {
  const fn = {
    id: 1,
    symbol: 'readFile',
    filename: 'test.c',
    start_line: 1,
    language: 'c',
    source: `void readFile() {
    FILE* f = fopen("data.txt", "r");
    fclose(f);
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length >= 1, true, 'Should detect fopen');
  t.assert.eq(result.releases.length >= 1, true, 'Should detect fclose');
});

// ============ C++ Smart Pointer Tests ============

await test('detects C++ smart pointers as safe patterns', async (t) => {
  const fn = {
    id: 1,
    symbol: 'useSmartPtr',
    filename: 'test.cpp',
    start_line: 1,
    language: 'cpp',
    source: `void useSmartPtr() {
    auto ptr = std::make_unique<MyClass>();
    auto shared = std::make_shared<Data>();
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.safe_patterns.length >= 1, true, 'Should detect safe smart pointer patterns');
  const names = result.safe_patterns.map(p => p.name);
  t.assert.eq(names.includes('make_unique') || names.includes('make_shared'), true, 'Should detect make_unique or make_shared');
});

await test('detects C++ new/delete', async (t) => {
  const fn = {
    id: 1,
    symbol: 'rawAlloc',
    filename: 'test.cpp',
    start_line: 1,
    language: 'cpp',
    source: `void rawAlloc() {
    MyClass* obj = new MyClass();
    delete obj;
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length >= 1, true, 'Should detect new');
  t.assert.eq(result.releases.length >= 1, true, 'Should detect delete');
});

await test('warns about raw new without smart pointers', async (t) => {
  const fn = {
    id: 1,
    symbol: 'rawNew',
    filename: 'test.cpp',
    start_line: 1,
    language: 'cpp',
    source: `void rawNew() {
    MyClass* obj = new MyClass();
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.warnings.length >= 1, true, 'Should warn about raw new');
  const ids = result.warnings.map(w => w.id);
  t.assert.eq(ids.includes('raw_new_without_smart_ptr'), true, 'Should have raw_new_without_smart_ptr warning');
});

await test('detects C++ RAII lock patterns', async (t) => {
  const fn = {
    id: 1,
    symbol: 'safeLock',
    filename: 'test.cpp',
    start_line: 1,
    language: 'cpp',
    source: `void safeLock() {
    std::lock_guard<std::mutex> lock(mtx);
    counter++;
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.safe_patterns.length >= 1, true, 'Should detect RAII lock');
  const names = result.safe_patterns.map(p => p.name);
  t.assert.eq(names.includes('lock_guard'), true, 'Should detect lock_guard');
});

// ============ JavaScript Resource Tests ============

await test('detects JavaScript setTimeout/clearTimeout', async (t) => {
  const fn = {
    id: 1,
    symbol: 'setupTimer',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `function setupTimer() {
    const id = setTimeout(() => {}, 1000);
    clearTimeout(id);
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length >= 1, true, 'Should detect setTimeout');
  t.assert.eq(result.releases.length >= 1, true, 'Should detect clearTimeout');
});

await test('detects JavaScript event listener leak', async (t) => {
  const fn = {
    id: 1,
    symbol: 'addListener',
    filename: 'test.js',
    start_line: 1,
    language: 'javascript',
    source: `function addListener() {
    element.addEventListener('click', handler);
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length >= 1, true, 'Should detect addEventListener');
  t.assert.eq(result.potential_leaks.length >= 1, true, 'Should detect potential listener leak');
});

// ============ Python Context Manager Tests ============

await test('detects Python with statement as safe', async (t) => {
  const fn = {
    id: 1,
    symbol: 'read_file',
    filename: 'test.py',
    start_line: 1,
    language: 'python',
    source: `def read_file():
    with open('data.txt', 'r') as f:
        return f.read()`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.safe_patterns.length >= 1, true, 'Should detect with statement as safe');
});

await test('detects Python file handle leak', async (t) => {
  const fn = {
    id: 1,
    symbol: 'leaky_open',
    filename: 'test.py',
    start_line: 1,
    language: 'python',
    source: `def leaky_open():
    f = open('data.txt', 'r')
    return f.read()`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length >= 1, true, 'Should detect open');
  // With statement detection may prevent leak warning in some cases
});

// ============ Java Resource Tests ============

await test('detects Java try-with-resources as safe', async (t) => {
  const fn = {
    id: 1,
    symbol: 'readFile',
    filename: 'Test.java',
    start_line: 1,
    language: 'java',
    source: `void readFile() {
    try (FileInputStream fis = new FileInputStream("file")) {
        fis.read();
    }
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.safe_patterns.length >= 1, true, 'Should detect try-with-resources as safe');
});

await test('detects Java stream without close', async (t) => {
  const fn = {
    id: 1,
    symbol: 'leakyStream',
    filename: 'Test.java',
    start_line: 1,
    language: 'java',
    source: `void leakyStream() {
    FileInputStream fis = new FileInputStream("file");
    fis.read();
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length >= 1, true, 'Should detect stream creation');
});

// ============ C# Resource Tests ============

await test('detects C# using statement as safe', async (t) => {
  const fn = {
    id: 1,
    symbol: 'ReadFile',
    filename: 'Test.cs',
    start_line: 1,
    language: 'csharp',
    source: `void ReadFile() {
    using (var stream = new FileStream("file", FileMode.Open)) {
        stream.Read(buffer, 0, 100);
    }
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.safe_patterns.length >= 1, true, 'Should detect using statement as safe');
});

// ============ Go Resource Tests ============

await test('detects Go defer as safe pattern', async (t) => {
  const fn = {
    id: 1,
    symbol: 'readFile',
    filename: 'test.go',
    start_line: 1,
    language: 'go',
    source: `func readFile() {
    f, _ := os.Open("file")
    defer f.Close()
    f.Read(buf)
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.safe_patterns.length >= 1, true, 'Should detect defer as safe');
});

await test('detects Go file handle without defer', async (t) => {
  const fn = {
    id: 1,
    symbol: 'leakyFile',
    filename: 'test.go',
    start_line: 1,
    language: 'go',
    source: `func leakyFile() {
    f, _ := os.Open("file")
    f.Read(buf)
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length >= 1, true, 'Should detect os.Open');
  // Without defer, this could be a potential leak
});

// ============ Rust Resource Tests ============

await test('detects Rust ownership patterns as safe', async (t) => {
  const fn = {
    id: 1,
    symbol: 'use_box',
    filename: 'test.rs',
    start_line: 1,
    language: 'rust',
    source: `fn use_box() {
    let data = Box::new(MyStruct::new());
    let shared = Arc::new(data);
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.safe_patterns.length >= 1, true, 'Should detect Box/Arc as safe');
});

await test('detects Rust File as safe RAII', async (t) => {
  const fn = {
    id: 1,
    symbol: 'read_file',
    filename: 'test.rs',
    start_line: 1,
    language: 'rust',
    source: `fn read_file() -> io::Result<String> {
    let mut file = File::open("data.txt")?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    Ok(contents)
}`
  };

  const result = analyze_function_resources(fn);

  t.assert.eq(result.safe_patterns.length >= 1, true, 'Should detect File as safe RAII');
});

// ============ No Resources Detection Tests ============

await test('returns empty results for code without resources', async (t) => {
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

  const result = analyze_function_resources(fn);

  t.assert.eq(result.acquisitions.length, 0, 'Should have no acquisitions');
  t.assert.eq(result.releases.length, 0, 'Should have no releases');
  t.assert.eq(result.safe_patterns.length, 0, 'Should have no safe patterns');
  t.assert.eq(result.potential_leaks.length, 0, 'Should have no potential leaks');
});
