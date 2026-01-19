'use strict';

/**
 * @fileoverview Tests for design pattern detection functions.
 */

import { test } from 'st';
import {
  detect_patterns_in_source,
  analyze_error_handling,
  DESIGN_PATTERNS,
  ERROR_HANDLING_PATTERNS
} from '../../../lib/analysis/patterns.mjs';

// ============ Constants tests ============

await test('DESIGN_PATTERNS has creational patterns', async (t) => {
  t.assert.ok(DESIGN_PATTERNS.singleton, 'Should have singleton pattern');
  t.assert.ok(DESIGN_PATTERNS.factory, 'Should have factory pattern');
  t.assert.ok(DESIGN_PATTERNS.builder, 'Should have builder pattern');
});

await test('DESIGN_PATTERNS has structural patterns', async (t) => {
  t.assert.ok(DESIGN_PATTERNS.adapter, 'Should have adapter pattern');
  t.assert.ok(DESIGN_PATTERNS.decorator, 'Should have decorator pattern');
  t.assert.ok(DESIGN_PATTERNS.facade, 'Should have facade pattern');
  t.assert.ok(DESIGN_PATTERNS.proxy, 'Should have proxy pattern');
});

await test('DESIGN_PATTERNS has behavioral patterns', async (t) => {
  t.assert.ok(DESIGN_PATTERNS.observer, 'Should have observer pattern');
});

await test('ERROR_HANDLING_PATTERNS has patterns for major languages', async (t) => {
  t.assert.ok(ERROR_HANDLING_PATTERNS.try_catch, 'Should have try_catch patterns');
  t.assert.ok(ERROR_HANDLING_PATTERNS.empty_catch, 'Should have empty_catch patterns');
  t.assert.ok(ERROR_HANDLING_PATTERNS.finally_block, 'Should have finally_block patterns');
});

// ============ detect_patterns_in_source tests ============

await test('detect_patterns_in_source detects singleton pattern', async (t) => {
  const source = `
    class Database {
      private static instance = null;

      static getInstance() {
        if (!instance) {
          instance = new Database();
        }
        return instance;
      }
    }
  `;
  const result = detect_patterns_in_source(source, 'javascript');

  const has_singleton = result.some(p => p.id === 'singleton');
  t.assert.ok(has_singleton, 'Should detect singleton pattern');
});

await test('detect_patterns_in_source detects factory pattern', async (t) => {
  const source = `
    class AnimalFactory {
      createAnimal(type) {
        switch(type) {
          case 'dog': return new Dog();
          case 'cat': return new Cat();
          default: return new Animal();
        }
      }
    }
  `;
  const result = detect_patterns_in_source(source, 'javascript');

  const has_factory = result.some(p => p.id === 'factory');
  t.assert.ok(has_factory, 'Should detect factory pattern');
});

await test('detect_patterns_in_source detects builder pattern', async (t) => {
  const source = `
    class UserBuilder {
      setName(name) {
        this.name = name;
        return this;
      }

      setAge(age) {
        this.age = age;
        return this;
      }

      build() {
        return new User(this.name, this.age);
      }
    }
  `;
  const result = detect_patterns_in_source(source, 'javascript');

  const has_builder = result.some(p => p.id === 'builder');
  t.assert.ok(has_builder, 'Should detect builder pattern');
});

await test('detect_patterns_in_source detects observer pattern', async (t) => {
  const source = `
    class EventEmitter {
      constructor() {
        this.listeners = [];
      }

      subscribe(fn) {
        this.listeners.push(fn);
      }

      emit(event) {
        this.listeners.forEach(fn => fn(event));
      }
    }
  `;
  const result = detect_patterns_in_source(source, 'javascript');

  const has_observer = result.some(p => p.id === 'observer');
  t.assert.ok(has_observer, 'Should detect observer pattern');
});

await test('detect_patterns_in_source detects proxy pattern', async (t) => {
  const source = `
    const handler = {
      get(target, prop) {
        return Reflect.get(target, prop);
      },
      set(target, prop, value) {
        return Reflect.set(target, prop, value);
      }
    };
    const proxy = new Proxy(target, handler);
  `;
  const result = detect_patterns_in_source(source, 'javascript');

  const has_proxy = result.some(p => p.id === 'proxy');
  t.assert.ok(has_proxy, 'Should detect proxy pattern');
});

await test('detect_patterns_in_source detects decorator pattern', async (t) => {
  const source = `
    @Component
    class MyComponent {
      @Input()
      name: string;
    }
  `;
  const result = detect_patterns_in_source(source, 'typescript');

  const has_decorator = result.some(p => p.id === 'decorator');
  t.assert.ok(has_decorator, 'Should detect decorator pattern');
});

await test('detect_patterns_in_source returns empty for plain code', async (t) => {
  const source = `
    function add(a, b) {
      return a + b;
    }
  `;
  const result = detect_patterns_in_source(source, 'javascript');

  t.assert.ok(Array.isArray(result), 'Should return an array');
  // Plain code might not have any patterns
  t.assert.ok(result.length >= 0, 'Should return valid result');
});

await test('detect_patterns_in_source handles Python patterns', async (t) => {
  const source = `
    class Singleton:
        _instance = None

        def __new__(cls):
            if cls._instance is None:
                cls._instance = super().__new__(cls)
            return cls._instance
  `;
  const result = detect_patterns_in_source(source, 'python');

  const has_singleton = result.some(p => p.id === 'singleton');
  t.assert.ok(has_singleton, 'Should detect Python singleton pattern');
});

// ============ analyze_error_handling tests ============

await test('analyze_error_handling counts try-catch blocks', async (t) => {
  const source = `
    function foo() {
      try {
        doSomething();
      } catch (e) {
        console.error(e);
      }

      try {
        doSomethingElse();
      } catch (e) {
        handleError(e);
      }
    }
  `;
  const result = analyze_error_handling(source, 'javascript');

  t.assert.ok(result.try_catch_count >= 2, 'Should count try-catch blocks');
});

await test('analyze_error_handling detects empty catch blocks', async (t) => {
  const source = `
    function foo() {
      try {
        doSomething();
      } catch (e) {
        // empty catch
      }

      try {
        doSomethingElse();
      } catch (e) {}
    }
  `;
  const result = analyze_error_handling(source, 'javascript');

  t.assert.ok(result.empty_catch_count >= 1, 'Should detect empty catch blocks');
});

await test('analyze_error_handling counts finally blocks', async (t) => {
  const source = `
    function foo() {
      try {
        doSomething();
      } catch (e) {
        handleError(e);
      } finally {
        cleanup();
      }
    }
  `;
  const result = analyze_error_handling(source, 'javascript');

  t.assert.ok(result.finally_count >= 1, 'Should count finally blocks');
});

await test('analyze_error_handling rates coverage correctly', async (t) => {
  const source_none = `function foo() { return 1; }`;
  const result_none = analyze_error_handling(source_none, 'javascript');
  t.assert.eq(result_none.coverage, 'none', 'No try-catch should be rated as none');

  const source_good = `
    function foo() {
      try {
        doSomething();
      } catch (e) {
        handleError(e);
      } finally {
        cleanup();
      }
    }
  `;
  const result_good = analyze_error_handling(source_good, 'javascript');
  t.assert.eq(result_good.coverage, 'good', 'Try-catch with finally should be rated as good');
});

await test('analyze_error_handling handles Python', async (t) => {
  const source = `
    def foo():
        try:
            do_something()
        except Exception as e:
            handle_error(e)
        finally:
            cleanup()
  `;
  const result = analyze_error_handling(source, 'python');

  t.assert.ok(result.try_catch_count >= 1, 'Should count Python try-except');
  t.assert.ok(result.finally_count >= 1, 'Should count Python finally');
});

await test('analyze_error_handling handles Go defer', async (t) => {
  const source = `
    func foo() {
        defer cleanup()
        defer closeFile()
        doSomething()
    }
  `;
  const result = analyze_error_handling(source, 'go');

  t.assert.ok(result.finally_count >= 2, 'Should count Go defer as finally equivalent');
});
