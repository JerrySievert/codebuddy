'use strict';

/**
 * @fileoverview Test analysis module.
 * Analyzes test code and coverage patterns.
 * Computed on-demand from source code - no database changes required.
 * @module lib/testing
 */

import { query } from './db.mjs';

/**
 * Test file detection patterns by language.
 */
const TEST_FILE_PATTERNS = {
  javascript: [
    /\.test\.js$/,
    /\.spec\.js$/,
    /\.test\.mjs$/,
    /\.spec\.mjs$/,
    /_test\.js$/,
    /test_.*\.js$/,
    /^test\.js$/,
    /\/tests?\//,
    /__tests__\//
  ],
  typescript: [
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /\.test\.tsx$/,
    /\.spec\.tsx$/,
    /_test\.ts$/,
    /\/tests?\//,
    /__tests__\//
  ],
  python: [
    /^test_.*\.py$/,
    /_test\.py$/,
    /tests?\.py$/,
    /\/tests?\//,
    /test_.*\.py$/
  ],
  java: [
    /Test\.java$/,
    /Tests\.java$/,
    /IT\.java$/,
    /\/test\//
  ],
  go: [
    /_test\.go$/
  ],
  rust: [
    /#\[cfg\(test\)\]/,
    /#\[test\]/,
    /\/tests?\//
  ],
  ruby: [
    /_test\.rb$/,
    /_spec\.rb$/,
    /\/spec\//,
    /\/test\//
  ],
  php: [
    /Test\.php$/,
    /\/tests?\//
  ],
  csharp: [
    /Tests?\.cs$/,
    /\.Tests?\//
  ]
};

/**
 * Test function/method patterns by language.
 */
const TEST_FUNCTION_PATTERNS = {
  javascript: [
    /\b(it|test|describe|beforeEach|afterEach|beforeAll|afterAll)\s*\(/,
    /\.test\s*\(/,
    /\.spec\s*\(/
  ],
  typescript: [
    /\b(it|test|describe|beforeEach|afterEach|beforeAll|afterAll)\s*\(/,
    /\.test\s*\(/,
    /\.spec\s*\(/
  ],
  python: [
    /def\s+test_/,
    /class\s+Test/,
    /@pytest\./,
    /unittest\.TestCase/
  ],
  java: [
    /@Test\b/,
    /@Before\b/,
    /@After\b/,
    /@BeforeEach\b/,
    /@AfterEach\b/,
    /public\s+void\s+test\w+\s*\(/
  ],
  go: [
    /func\s+Test\w+\s*\(\s*t\s+\*testing\.T\s*\)/,
    /func\s+Benchmark\w+\s*\(/,
    /func\s+Example\w+\s*\(/
  ],
  rust: [
    /#\[test\]/,
    /#\[cfg\(test\)\]/
  ],
  ruby: [
    /def\s+test_/,
    /it\s+['"`]/,
    /describe\s+['"`]/,
    /context\s+['"`]/
  ],
  php: [
    /public\s+function\s+test\w+\s*\(/,
    /@test\b/
  ],
  csharp: [
    /\[Test\]/,
    /\[Fact\]/,
    /\[Theory\]/,
    /\[TestMethod\]/
  ]
};

/**
 * Assertion patterns by language.
 */
const ASSERTION_PATTERNS = {
  javascript: [
    /expect\s*\(/g,
    /assert\s*\./g,
    /\.toBe\s*\(/g,
    /\.toEqual\s*\(/g,
    /\.toMatch\s*\(/g,
    /\.toThrow\s*\(/g,
    /\.toHaveBeenCalled/g,
    /\.resolves\./g,
    /\.rejects\./g,
    /should\./g
  ],
  typescript: [
    /expect\s*\(/g,
    /assert\s*\./g,
    /\.toBe\s*\(/g,
    /\.toEqual\s*\(/g,
    /\.toMatch\s*\(/g,
    /\.toThrow\s*\(/g,
    /\.toHaveBeenCalled/g
  ],
  python: [
    /assert\s+/g,
    /self\.assert\w+\s*\(/g,
    /pytest\.raises/g,
    /\.assert_called/g
  ],
  java: [
    /assert\w+\s*\(/g,
    /Assert\.\w+\s*\(/g,
    /assertThat\s*\(/g,
    /verify\s*\(/g
  ],
  go: [
    /t\.(Error|Fatal|Log|Skip)\w*\s*\(/g,
    /assert\.\w+\s*\(/g,
    /require\.\w+\s*\(/g
  ],
  rust: [
    /assert!\s*\(/g,
    /assert_eq!\s*\(/g,
    /assert_ne!\s*\(/g,
    /debug_assert/g
  ],
  ruby: [
    /expect\s*\(/g,
    /assert\w*\s+/g,
    /should\s+/g,
    /\.to\s+/g
  ],
  php: [
    /\$this->assert\w+\s*\(/g,
    /Assert::\w+\s*\(/g
  ],
  csharp: [
    /Assert\.\w+\s*\(/g,
    /\.Should\(\)/g
  ]
};

/**
 * Mock/stub patterns by language.
 */
const MOCK_PATTERNS = {
  javascript: [
    /jest\.mock\s*\(/g,
    /jest\.spyOn\s*\(/g,
    /jest\.fn\s*\(/g,
    /sinon\.(stub|mock|spy)/g,
    /\.mockImplementation/g,
    /\.mockReturnValue/g,
    /\.mockResolvedValue/g
  ],
  typescript: [
    /jest\.mock\s*\(/g,
    /jest\.spyOn\s*\(/g,
    /jest\.fn\s*\(/g,
    /\.mockImplementation/g
  ],
  python: [
    /mock\./g,
    /MagicMock/g,
    /patch\s*\(/g,
    /@patch/g,
    /Mock\s*\(/g
  ],
  java: [
    /@Mock\b/g,
    /@Spy\b/g,
    /@InjectMocks/g,
    /Mockito\.\w+/g,
    /when\s*\(/g,
    /verify\s*\(/g
  ],
  go: [
    /mock\w+/gi,
    /gomock/g
  ],
  rust: [
    /mockall/g,
    /#\[automock\]/g
  ],
  ruby: [
    /double\s*\(/g,
    /allow\s*\(/g,
    /receive\s*\(/g,
    /stub\s*\(/g
  ],
  php: [
    /createMock\s*\(/g,
    /getMockBuilder/g,
    /prophesize\s*\(/g
  ],
  csharp: [
    /Mock<\w+>/g,
    /\.Setup\s*\(/g,
    /\.Returns\s*\(/g
  ]
};

/**
 * Check if a filename is a test file.
 * @param {string} filename - The filename to check
 * @param {string} language - The programming language
 * @returns {boolean} True if it's a test file
 */
const isTestFile = (filename, language) => {
  const patterns = TEST_FILE_PATTERNS[language] || TEST_FILE_PATTERNS.javascript;
  return patterns.some(pattern => pattern.test(filename));
};

/**
 * Check if source contains test functions.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {boolean} True if it contains tests
 */
const hasTestFunctions = (source, language) => {
  const patterns = TEST_FUNCTION_PATTERNS[language] || TEST_FUNCTION_PATTERNS.javascript;
  return patterns.some(pattern => pattern.test(source));
};

/**
 * Count assertions in source code.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {number} Number of assertions
 */
const countAssertions = (source, language) => {
  const patterns = ASSERTION_PATTERNS[language] || ASSERTION_PATTERNS.javascript;
  let count = 0;

  for (const pattern of patterns) {
    const matches = source.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
};

/**
 * Count mock/stub usage in source code.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {number} Number of mocks/stubs
 */
const countMocks = (source, language) => {
  const patterns = MOCK_PATTERNS[language] || MOCK_PATTERNS.javascript;
  let count = 0;

  for (const pattern of patterns) {
    const matches = source.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
};

/**
 * Analyze test naming conventions.
 * @param {string} symbol - Test function name
 * @param {string} language - Programming language
 * @returns {Object} Naming analysis
 */
const analyzeTestNaming = (symbol, language) => {
  const issues = [];
  const suggestions = [];

  // Check for descriptive naming
  if (symbol.length < 10) {
    issues.push('Test name is too short - may not be descriptive enough');
  }

  // Check for common bad patterns
  if (/^test\d+$/.test(symbol)) {
    issues.push('Test name uses numeric suffix instead of description');
    suggestions.push('Use descriptive names like "testUserLoginWithValidCredentials"');
  }

  if (/^test$/.test(symbol)) {
    issues.push('Generic test name without description');
  }

  // Check for good patterns
  const goodPatterns = {
    javascript: /^(should|it|test|when|given)/i,
    python: /^test_[a-z]/,
    java: /^(test|should)[A-Z]/,
    go: /^Test[A-Z]/
  };

  const pattern = goodPatterns[language];
  const followsConvention = pattern ? pattern.test(symbol) : true;

  return {
    symbol,
    follows_convention: followsConvention,
    issues,
    suggestions
  };
};

/**
 * Analyze tests for a project.
 * @param {number} projectId - The project ID
 * @returns {Promise<Object>} Test analysis results
 */
const analyze_project_tests = async (projectId) => {
  // Get all entities
  const entities = await query`
    SELECT id, symbol, filename, type, language, source, start_line, end_line
    FROM entity
    WHERE project_id = ${projectId}
    ORDER BY filename, start_line
  `;

  // Get file list
  const files = await query`
    SELECT DISTINCT filename, language
    FROM entity
    WHERE project_id = ${projectId}
  `;

  const results = {
    summary: {
      total_files: files.length,
      test_files: 0,
      non_test_files: 0,
      total_functions: entities.length,
      test_functions: 0,
      non_test_functions: 0,
      test_to_code_ratio: 0,
      total_assertions: 0,
      total_mocks: 0,
      avg_assertions_per_test: 0,
      by_language: {}
    },
    test_files: [],
    test_functions: [],
    assertions_by_file: {},
    mock_usage: [],
    naming_issues: [],
    coverage_gaps: [],
    by_file: {}
  };

  // Categorize files
  const testFileSet = new Set();
  const nonTestFileSet = new Set();

  for (const file of files) {
    if (isTestFile(file.filename, file.language)) {
      testFileSet.add(file.filename);
      results.test_files.push({
        filename: file.filename,
        language: file.language
      });
    } else {
      nonTestFileSet.add(file.filename);
    }
  }

  results.summary.test_files = testFileSet.size;
  results.summary.non_test_files = nonTestFileSet.size;

  // Analyze each entity
  const languageStats = {};
  const testFunctionsByFile = {};

  for (const entity of entities) {
    const { symbol, filename, type, language, source, start_line, end_line } = entity;

    // Initialize language stats
    if (!languageStats[language]) {
      languageStats[language] = {
        total_functions: 0,
        test_functions: 0,
        assertions: 0,
        mocks: 0
      };
    }
    languageStats[language].total_functions++;

    // Initialize file stats
    if (!results.by_file[filename]) {
      results.by_file[filename] = {
        is_test_file: testFileSet.has(filename),
        functions: 0,
        test_functions: 0,
        assertions: 0,
        mocks: 0
      };
    }
    results.by_file[filename].functions++;

    // Check if this is a test function
    const inTestFile = testFileSet.has(filename);
    const hasTests = source ? hasTestFunctions(source, language) : false;
    const isTest = inTestFile || hasTests || /^test/i.test(symbol) || symbol.includes('Test');

    if (isTest) {
      results.summary.test_functions++;
      languageStats[language].test_functions++;
      results.by_file[filename].test_functions++;

      // Count assertions and mocks
      const assertionCount = source ? countAssertions(source, language) : 0;
      const mockCount = source ? countMocks(source, language) : 0;

      results.summary.total_assertions += assertionCount;
      results.summary.total_mocks += mockCount;
      languageStats[language].assertions += assertionCount;
      languageStats[language].mocks += mockCount;
      results.by_file[filename].assertions += assertionCount;
      results.by_file[filename].mocks += mockCount;

      results.test_functions.push({
        symbol,
        filename,
        line: start_line,
        language,
        assertions: assertionCount,
        mocks: mockCount
      });

      // Track by file for assertions
      if (!results.assertions_by_file[filename]) {
        results.assertions_by_file[filename] = 0;
      }
      results.assertions_by_file[filename] += assertionCount;

      // Track mock usage
      if (mockCount > 0) {
        results.mock_usage.push({
          symbol,
          filename,
          line: start_line,
          mock_count: mockCount
        });
      }

      // Check naming convention
      const namingAnalysis = analyzeTestNaming(symbol, language);
      if (namingAnalysis.issues.length > 0) {
        results.naming_issues.push({
          symbol,
          filename,
          line: start_line,
          issues: namingAnalysis.issues,
          suggestions: namingAnalysis.suggestions
        });
      }

      // Track test functions by file for gap analysis
      if (!testFunctionsByFile[filename]) {
        testFunctionsByFile[filename] = [];
      }
      testFunctionsByFile[filename].push(symbol);
    } else {
      results.summary.non_test_functions++;
    }
  }

  // Calculate ratios
  if (results.summary.non_test_functions > 0) {
    results.summary.test_to_code_ratio = Math.round(
      (results.summary.test_functions / results.summary.non_test_functions) * 100
    ) / 100;
  }

  if (results.summary.test_functions > 0) {
    results.summary.avg_assertions_per_test = Math.round(
      (results.summary.total_assertions / results.summary.test_functions) * 10
    ) / 10;
  }

  // By language stats
  for (const [lang, stats] of Object.entries(languageStats)) {
    results.summary.by_language[lang] = {
      ...stats,
      test_ratio: stats.total_functions > 0
        ? Math.round((stats.test_functions / stats.total_functions) * 100)
        : 0
    };
  }

  // Identify potential coverage gaps (non-test files without corresponding test files)
  for (const nonTestFile of nonTestFileSet) {
    const baseName = nonTestFile.replace(/\.\w+$/, '');
    const hasTests = Array.from(testFileSet).some(testFile =>
      testFile.includes(baseName) ||
      testFile.includes(baseName.split('/').pop())
    );

    if (!hasTests) {
      results.coverage_gaps.push({
        filename: nonTestFile,
        message: 'No corresponding test file found'
      });
    }
  }

  // Sort and limit results
  results.test_functions.sort((a, b) => b.assertions - a.assertions);
  if (results.test_functions.length > 100) {
    results.test_functions_truncated = true;
    results.test_functions = results.test_functions.slice(0, 100);
  }

  results.mock_usage.sort((a, b) => b.mock_count - a.mock_count);
  if (results.mock_usage.length > 50) {
    results.mock_usage = results.mock_usage.slice(0, 50);
  }

  if (results.naming_issues.length > 50) {
    results.naming_issues_truncated = true;
    results.naming_issues = results.naming_issues.slice(0, 50);
  }

  if (results.coverage_gaps.length > 50) {
    results.coverage_gaps_truncated = true;
    results.coverage_gaps = results.coverage_gaps.slice(0, 50);
  }

  return results;
};

export {
  analyze_project_tests,
  isTestFile,
  hasTestFunctions,
  countAssertions,
  countMocks,
  analyzeTestNaming,
  TEST_FILE_PATTERNS,
  TEST_FUNCTION_PATTERNS,
  ASSERTION_PATTERNS,
  MOCK_PATTERNS
};
