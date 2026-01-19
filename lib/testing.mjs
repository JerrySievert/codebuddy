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
  java: [/Test\.java$/, /Tests\.java$/, /IT\.java$/, /\/test\//],
  go: [/_test\.go$/],
  rust: [/#\[cfg\(test\)\]/, /#\[test\]/, /\/tests?\//],
  ruby: [/_test\.rb$/, /_spec\.rb$/, /\/spec\//, /\/test\//],
  php: [/Test\.php$/, /\/tests?\//],
  csharp: [/Tests?\.cs$/, /\.Tests?\//]
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
  python: [/def\s+test_/, /class\s+Test/, /@pytest\./, /unittest\.TestCase/],
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
  rust: [/#\[test\]/, /#\[cfg\(test\)\]/],
  ruby: [/def\s+test_/, /it\s+['"`]/, /describe\s+['"`]/, /context\s+['"`]/],
  php: [/public\s+function\s+test\w+\s*\(/, /@test\b/],
  csharp: [/\[Test\]/, /\[Fact\]/, /\[Theory\]/, /\[TestMethod\]/]
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
  ruby: [/expect\s*\(/g, /assert\w*\s+/g, /should\s+/g, /\.to\s+/g],
  php: [/\$this->assert\w+\s*\(/g, /Assert::\w+\s*\(/g],
  csharp: [/Assert\.\w+\s*\(/g, /\.Should\(\)/g]
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
  python: [/mock\./g, /MagicMock/g, /patch\s*\(/g, /@patch/g, /Mock\s*\(/g],
  java: [
    /@Mock\b/g,
    /@Spy\b/g,
    /@InjectMocks/g,
    /Mockito\.\w+/g,
    /when\s*\(/g,
    /verify\s*\(/g
  ],
  go: [/mock\w+/gi, /gomock/g],
  rust: [/mockall/g, /#\[automock\]/g],
  ruby: [/double\s*\(/g, /allow\s*\(/g, /receive\s*\(/g, /stub\s*\(/g],
  php: [/createMock\s*\(/g, /getMockBuilder/g, /prophesize\s*\(/g],
  csharp: [/Mock<\w+>/g, /\.Setup\s*\(/g, /\.Returns\s*\(/g]
};

/**
 * Check if a filename is a test file.
 * @param {string} filename - The filename to check
 * @param {string} language - The programming language
 * @returns {boolean} True if it's a test file
 */
const is_test_file = (filename, language) => {
  const patterns =
    TEST_FILE_PATTERNS[language] || TEST_FILE_PATTERNS.javascript;
  return patterns.some((pattern) => pattern.test(filename));
};

/**
 * Check if source contains test functions.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {boolean} True if it contains tests
 */
const has_test_functions = (source, language) => {
  const patterns =
    TEST_FUNCTION_PATTERNS[language] || TEST_FUNCTION_PATTERNS.javascript;
  return patterns.some((pattern) => pattern.test(source));
};

/**
 * Count assertions in source code.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {number} Number of assertions
 */
const count_assertions = (source, language) => {
  const patterns =
    ASSERTION_PATTERNS[language] || ASSERTION_PATTERNS.javascript;
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
const count_mocks = (source, language) => {
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
const analyze_test_naming = (symbol, language) => {
  const issues = [];
  const suggestions = [];

  // Check for descriptive naming
  if (symbol.length < 10) {
    issues.push('Test name is too short - may not be descriptive enough');
  }

  // Check for common bad patterns
  if (/^test\d+$/.test(symbol)) {
    issues.push('Test name uses numeric suffix instead of description');
    suggestions.push(
      'Use descriptive names like "testUserLoginWithValidCredentials"'
    );
  }

  if (/^test$/.test(symbol)) {
    issues.push('Generic test name without description');
  }

  // Check for good patterns
  const good_patterns = {
    javascript: /^(should|it|test|when|given)/i,
    python: /^test_[a-z]/,
    java: /^(test|should)[A-Z]/,
    go: /^Test[A-Z]/
  };

  const pattern = good_patterns[language];
  const follows_convention = pattern ? pattern.test(symbol) : true;

  return {
    symbol,
    follows_convention: follows_convention,
    issues,
    suggestions
  };
};

/**
 * Categorize files into test and non-test sets.
 * @param {Object[]} files - Array of file objects with filename and language
 * @returns {Object} Object with test_file_set, non_test_file_set, and test_files array
 * @private
 */
const categorize_files = (files) => {
  const test_file_set = new Set();
  const non_test_file_set = new Set();
  const test_files = [];

  for (const file of files) {
    if (is_test_file(file.filename, file.language)) {
      test_file_set.add(file.filename);
      test_files.push({
        filename: file.filename,
        language: file.language
      });
    } else {
      non_test_file_set.add(file.filename);
    }
  }

  return { test_file_set, non_test_file_set, test_files };
};

/**
 * Analyze a single entity for test metrics.
 * @param {Object} entity - Entity to analyze
 * @param {Object} context - Analysis context with results, stats, and sets
 * @private
 */
const analyze_entity = (entity, context) => {
  const { results, language_stats, test_file_set } = context;
  const { symbol, filename, language, source, start_line } = entity;

  // Initialize language stats
  if (!language_stats[language]) {
    language_stats[language] = {
      total_functions: 0,
      test_functions: 0,
      assertions: 0,
      mocks: 0
    };
  }
  language_stats[language].total_functions++;

  // Initialize file stats
  if (!results.by_file[filename]) {
    results.by_file[filename] = {
      is_test_file: test_file_set.has(filename),
      functions: 0,
      test_functions: 0,
      assertions: 0,
      mocks: 0
    };
  }
  results.by_file[filename].functions++;

  // Check if this is a test function
  const in_test_file = test_file_set.has(filename);
  const has_tests = source ? has_test_functions(source, language) : false;
  const is_test_fn =
    in_test_file ||
    has_tests ||
    /^test/i.test(symbol) ||
    symbol.includes('Test');

  if (is_test_fn) {
    process_test_entity(entity, context);
  } else {
    results.summary.non_test_functions++;
  }
};

/**
 * Process a test entity and update metrics.
 * @param {Object} entity - Test entity to process
 * @param {Object} context - Analysis context
 * @private
 */
const process_test_entity = (entity, context) => {
  const { results, language_stats } = context;
  const { symbol, filename, language, source, start_line } = entity;

  results.summary.test_functions++;
  language_stats[language].test_functions++;
  results.by_file[filename].test_functions++;

  // Count assertions and mocks
  const assertion_count = source ? count_assertions(source, language) : 0;
  const mock_count = source ? count_mocks(source, language) : 0;

  results.summary.total_assertions += assertion_count;
  results.summary.total_mocks += mock_count;
  language_stats[language].assertions += assertion_count;
  language_stats[language].mocks += mock_count;
  results.by_file[filename].assertions += assertion_count;
  results.by_file[filename].mocks += mock_count;

  results.test_functions.push({
    symbol,
    filename,
    line: start_line,
    language,
    assertions: assertion_count,
    mocks: mock_count
  });

  // Track by file for assertions
  if (!results.assertions_by_file[filename]) {
    results.assertions_by_file[filename] = 0;
  }
  results.assertions_by_file[filename] += assertion_count;

  // Track mock usage
  if (mock_count > 0) {
    results.mock_usage.push({
      symbol,
      filename,
      line: start_line,
      mock_count: mock_count
    });
  }

  // Check naming convention
  const naming_analysis = analyze_test_naming(symbol, language);
  if (naming_analysis.issues.length > 0) {
    results.naming_issues.push({
      symbol,
      filename,
      line: start_line,
      issues: naming_analysis.issues,
      suggestions: naming_analysis.suggestions
    });
  }
};

/**
 * Calculate test coverage ratios and statistics.
 * @param {Object} results - Results object to update
 * @param {Object} language_stats - Language-specific stats
 * @private
 */
const calculate_ratios = (results, language_stats) => {
  if (results.summary.non_test_functions > 0) {
    results.summary.test_to_code_ratio =
      Math.round(
        (results.summary.test_functions / results.summary.non_test_functions) *
          100
      ) / 100;
  }

  if (results.summary.test_functions > 0) {
    results.summary.avg_assertions_per_test =
      Math.round(
        (results.summary.total_assertions / results.summary.test_functions) * 10
      ) / 10;
  }

  for (const [lang, stats] of Object.entries(language_stats)) {
    results.summary.by_language[lang] = {
      ...stats,
      test_ratio:
        stats.total_functions > 0
          ? Math.round((stats.test_functions / stats.total_functions) * 100)
          : 0
    };
  }
};

/**
 * Identify files without corresponding test files.
 * @param {Set} test_file_set - Set of test file names
 * @param {Set} non_test_file_set - Set of non-test file names
 * @returns {Object[]} Array of coverage gap objects
 * @private
 */
const identify_coverage_gaps = (test_file_set, non_test_file_set) => {
  const gaps = [];

  for (const non_test_file of non_test_file_set) {
    const base_name = non_test_file.replace(/\.\w+$/, '');
    const has_tests = Array.from(test_file_set).some(
      (test_file) =>
        test_file.includes(base_name) ||
        test_file.includes(base_name.split('/').pop())
    );

    if (!has_tests) {
      gaps.push({
        filename: non_test_file,
        message: 'No corresponding test file found'
      });
    }
  }

  return gaps;
};

/**
 * Sort and truncate result arrays to limit size.
 * @param {Object} results - Results object to modify
 * @private
 */
const finalize_results = (results) => {
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
};

/**
 * Analyze tests for a project.
 * @param {number} project_id - The project ID
 * @returns {Promise<Object>} Test analysis results
 */
const analyze_project_tests = async (project_id) => {
  // Get all entities
  const entities = await query`
    SELECT id, symbol, filename, type, language, source, start_line, end_line
    FROM entity
    WHERE project_id = ${project_id}
    ORDER BY filename, start_line
  `;

  // Get file list
  const files = await query`
    SELECT DISTINCT filename, language
    FROM entity
    WHERE project_id = ${project_id}
  `;

  // Initialize results
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
  const { test_file_set, non_test_file_set, test_files } =
    categorize_files(files);
  results.test_files = test_files;
  results.summary.test_files = test_file_set.size;
  results.summary.non_test_files = non_test_file_set.size;

  // Analyze entities
  const language_stats = {};
  const context = { results, language_stats, test_file_set };

  for (const entity of entities) {
    analyze_entity(entity, context);
  }

  // Calculate ratios and finalize
  calculate_ratios(results, language_stats);
  results.coverage_gaps = identify_coverage_gaps(
    test_file_set,
    non_test_file_set
  );
  finalize_results(results);

  return results;
};

export {
  analyze_project_tests,
  is_test_file,
  has_test_functions,
  count_assertions,
  count_mocks,
  analyze_test_naming,
  TEST_FILE_PATTERNS,
  TEST_FUNCTION_PATTERNS,
  ASSERTION_PATTERNS,
  MOCK_PATTERNS
};
