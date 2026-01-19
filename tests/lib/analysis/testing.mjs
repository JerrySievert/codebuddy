'use strict';

/**
 * @fileoverview Tests for test analysis functions.
 */

import { test } from 'st';
import {
  is_test_file,
  has_test_functions,
  count_assertions,
  count_mocks,
  analyze_test_naming,
  TEST_FILE_PATTERNS,
  TEST_FUNCTION_PATTERNS,
  ASSERTION_PATTERNS,
  MOCK_PATTERNS
} from '../../../lib/analysis/testing.mjs';

// ============ Constants tests ============

await test('TEST_FILE_PATTERNS has patterns for major languages', async (t) => {
  t.assert.ok(TEST_FILE_PATTERNS.javascript, 'Should have JavaScript patterns');
  t.assert.ok(TEST_FILE_PATTERNS.typescript, 'Should have TypeScript patterns');
  t.assert.ok(TEST_FILE_PATTERNS.python, 'Should have Python patterns');
  t.assert.ok(TEST_FILE_PATTERNS.java, 'Should have Java patterns');
  t.assert.ok(TEST_FILE_PATTERNS.go, 'Should have Go patterns');
  t.assert.ok(TEST_FILE_PATTERNS.rust, 'Should have Rust patterns');
});

await test('TEST_FUNCTION_PATTERNS has patterns for major languages', async (t) => {
  t.assert.ok(
    TEST_FUNCTION_PATTERNS.javascript,
    'Should have JavaScript patterns'
  );
  t.assert.ok(TEST_FUNCTION_PATTERNS.python, 'Should have Python patterns');
  t.assert.ok(TEST_FUNCTION_PATTERNS.java, 'Should have Java patterns');
});

await test('ASSERTION_PATTERNS has patterns for major languages', async (t) => {
  t.assert.ok(ASSERTION_PATTERNS.javascript, 'Should have JavaScript patterns');
  t.assert.ok(ASSERTION_PATTERNS.python, 'Should have Python patterns');
  t.assert.ok(ASSERTION_PATTERNS.java, 'Should have Java patterns');
});

await test('MOCK_PATTERNS has patterns for major languages', async (t) => {
  t.assert.ok(MOCK_PATTERNS.javascript, 'Should have JavaScript patterns');
  t.assert.ok(MOCK_PATTERNS.python, 'Should have Python patterns');
  t.assert.ok(MOCK_PATTERNS.java, 'Should have Java patterns');
});

// ============ is_test_file tests ============

await test('is_test_file detects JavaScript test files', async (t) => {
  t.assert.ok(
    is_test_file('foo.test.js', 'javascript'),
    'Should detect .test.js'
  );
  t.assert.ok(
    is_test_file('foo.spec.js', 'javascript'),
    'Should detect .spec.js'
  );
  t.assert.ok(
    is_test_file('foo.test.mjs', 'javascript'),
    'Should detect .test.mjs'
  );
  t.assert.ok(
    is_test_file('src/tests/foo.js', 'javascript'),
    'Should detect tests/ directory'
  );
  t.assert.ok(
    is_test_file('src/__tests__/foo.js', 'javascript'),
    'Should detect __tests__/ directory'
  );
});

await test('is_test_file detects Python test files', async (t) => {
  t.assert.ok(is_test_file('test_foo.py', 'python'), 'Should detect test_*.py');
  t.assert.ok(is_test_file('foo_test.py', 'python'), 'Should detect *_test.py');
  t.assert.ok(
    is_test_file('src/tests/foo.py', 'python'),
    'Should detect tests/ directory'
  );
});

await test('is_test_file detects Go test files', async (t) => {
  t.assert.ok(is_test_file('foo_test.go', 'go'), 'Should detect *_test.go');
});

await test('is_test_file detects Java test files', async (t) => {
  t.assert.ok(is_test_file('FooTest.java', 'java'), 'Should detect *Test.java');
  t.assert.ok(
    is_test_file('FooTests.java', 'java'),
    'Should detect *Tests.java'
  );
});

await test('is_test_file returns false for non-test files', async (t) => {
  t.assert.ok(
    !is_test_file('foo.js', 'javascript'),
    'Should not match regular .js'
  );
  t.assert.ok(
    !is_test_file('testing.js', 'javascript'),
    'Should not match testing.js'
  );
  t.assert.ok(
    !is_test_file('foo.py', 'python'),
    'Should not match regular .py'
  );
});

// ============ has_test_functions tests ============

await test('has_test_functions detects Jest/Mocha patterns', async (t) => {
  const source = `
    describe('MyComponent', () => {
      it('should work', () => {
        expect(true).toBe(true);
      });

      test('another test', () => {
        expect(1 + 1).toBe(2);
      });
    });
  `;
  t.assert.ok(
    has_test_functions(source, 'javascript'),
    'Should detect describe/it/test'
  );
});

await test('has_test_functions detects Python test patterns', async (t) => {
  const source = `
    import pytest

    class TestMyClass:
        def test_something(self):
            assert True

    def test_standalone():
        assert 1 == 1
  `;
  t.assert.ok(
    has_test_functions(source, 'python'),
    'Should detect Python test patterns'
  );
});

await test('has_test_functions detects Java test patterns', async (t) => {
  const source = `
    public class MyTest {
      @Test
      public void testSomething() {
        assertEquals(1, 1);
      }
    }
  `;
  t.assert.ok(
    has_test_functions(source, 'java'),
    'Should detect @Test annotation'
  );
});

await test('has_test_functions detects Go test patterns', async (t) => {
  const source = `
    func TestAdd(t *testing.T) {
      if add(1, 2) != 3 {
        t.Error("Expected 3")
      }
    }
  `;
  t.assert.ok(
    has_test_functions(source, 'go'),
    'Should detect Go test functions'
  );
});

await test('has_test_functions returns false for non-test code', async (t) => {
  const source = `
    function add(a, b) {
      return a + b;
    }
  `;
  t.assert.ok(
    !has_test_functions(source, 'javascript'),
    'Should not match non-test code'
  );
});

// ============ count_assertions tests ============

await test('count_assertions counts Jest assertions', async (t) => {
  const source = `
    expect(result).toBe(5);
    expect(obj).toEqual({ a: 1 });
    expect(fn).toHaveBeenCalled();
    expect(str).toMatch(/pattern/);
  `;
  const count = count_assertions(source, 'javascript');
  t.assert.ok(count >= 4, 'Should count multiple assertions');
});

await test('count_assertions counts Python assertions', async (t) => {
  const source = `
    assert result == 5
    self.assertEqual(a, b)
    self.assertTrue(condition)
    pytest.raises(ValueError)
  `;
  const count = count_assertions(source, 'python');
  t.assert.ok(count >= 3, 'Should count Python assertions');
});

await test('count_assertions returns 0 for no assertions', async (t) => {
  const source = `
    function foo() {
      return 1;
    }
  `;
  const count = count_assertions(source, 'javascript');
  t.assert.eq(count, 0, 'Should return 0 for no assertions');
});

// ============ count_mocks tests ============

await test('count_mocks counts Jest mocks', async (t) => {
  const source = `
    jest.mock('./myModule');
    const mockFn = jest.fn();
    jest.spyOn(obj, 'method');
  `;
  const count = count_mocks(source, 'javascript');
  t.assert.ok(count >= 3, 'Should count mock patterns');
});

await test('count_mocks counts Python mocks', async (t) => {
  const source = `
    from unittest.mock import Mock, patch

    @patch('module.function')
    def test_something(mock_fn):
        mock = Mock()
        MagicMock()
  `;
  const count = count_mocks(source, 'python');
  t.assert.ok(count >= 2, 'Should count Python mock patterns');
});

await test('count_mocks returns 0 for no mocks', async (t) => {
  const source = `
    function foo() {
      return 1;
    }
  `;
  const count = count_mocks(source, 'javascript');
  t.assert.eq(count, 0, 'Should return 0 for no mocks');
});

// ============ analyze_test_naming tests ============

await test('analyze_test_naming validates good test names', async (t) => {
  const result = analyze_test_naming('test_user_can_login', 'python');

  t.assert.ok(
    result.follows_convention,
    'Should validate good Python test name'
  );
  t.assert.eq(result.issues.length, 0, 'Should have no issues');
});

await test('analyze_test_naming validates JavaScript test names', async (t) => {
  const result = analyze_test_naming(
    'should return correct value',
    'javascript'
  );

  t.assert.ok(result.follows_convention, 'Should follow convention');
  t.assert.ok(result.suggestions !== undefined, 'Should have suggestions');
});

await test('analyze_test_naming detects short names', async (t) => {
  const result = analyze_test_naming('t', 'javascript');

  t.assert.ok(result.issues.length > 0, 'Short names should have issues');
});

await test('analyze_test_naming checks for descriptive prefixes', async (t) => {
  const result = analyze_test_naming('testUserLogin', 'java');

  t.assert.ok(
    result.follows_convention,
    'Should validate Java test name with test prefix'
  );
});
