'use strict';

/**
 * @fileoverview Naming convention analysis module.
 * Detects naming patterns and checks adherence to conventions.
 * Computed on-demand from source code - no database changes required.
 * @module lib/naming
 */

import { query } from './db.mjs';

/**
 * Naming convention patterns.
 */
const NAMING_PATTERNS = {
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
  snake_case: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
  SCREAMING_SNAKE_CASE: /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/,
  kebab_case: /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
  flatcase: /^[a-z][a-z0-9]*$/,
  UPPERCASE: /^[A-Z][A-Z0-9]*$/
};

/**
 * Language-specific naming conventions.
 */
const LANGUAGE_CONVENTIONS = {
  javascript: {
    function: ['camelCase'],
    class: ['PascalCase'],
    variable: ['camelCase'],
    constant: ['SCREAMING_SNAKE_CASE', 'camelCase'],
    parameter: ['camelCase'],
    method: ['camelCase']
  },
  typescript: {
    function: ['camelCase'],
    class: ['PascalCase'],
    interface: ['PascalCase'],
    type: ['PascalCase'],
    enum: ['PascalCase'],
    variable: ['camelCase'],
    constant: ['SCREAMING_SNAKE_CASE', 'camelCase'],
    parameter: ['camelCase'],
    method: ['camelCase']
  },
  python: {
    function: ['snake_case'],
    class: ['PascalCase'],
    variable: ['snake_case'],
    constant: ['SCREAMING_SNAKE_CASE'],
    parameter: ['snake_case'],
    method: ['snake_case']
  },
  java: {
    function: ['camelCase'],
    class: ['PascalCase'],
    interface: ['PascalCase'],
    variable: ['camelCase'],
    constant: ['SCREAMING_SNAKE_CASE'],
    parameter: ['camelCase'],
    method: ['camelCase']
  },
  go: {
    function: ['camelCase', 'PascalCase'],  // PascalCase for exported
    struct: ['PascalCase'],
    variable: ['camelCase'],
    constant: ['PascalCase', 'camelCase'],
    parameter: ['camelCase'],
    method: ['camelCase', 'PascalCase']
  },
  rust: {
    function: ['snake_case'],
    struct: ['PascalCase'],
    enum: ['PascalCase'],
    trait: ['PascalCase'],
    variable: ['snake_case'],
    constant: ['SCREAMING_SNAKE_CASE'],
    parameter: ['snake_case'],
    method: ['snake_case']
  },
  c: {
    function: ['snake_case', 'camelCase'],
    struct: ['snake_case', 'PascalCase'],
    variable: ['snake_case', 'camelCase'],
    constant: ['SCREAMING_SNAKE_CASE'],
    parameter: ['snake_case', 'camelCase']
  },
  cpp: {
    function: ['camelCase', 'snake_case', 'PascalCase'],
    class: ['PascalCase'],
    variable: ['camelCase', 'snake_case'],
    constant: ['SCREAMING_SNAKE_CASE', 'kPascalCase'],
    parameter: ['camelCase', 'snake_case'],
    method: ['camelCase', 'PascalCase']
  },
  ruby: {
    function: ['snake_case'],
    class: ['PascalCase'],
    module: ['PascalCase'],
    variable: ['snake_case'],
    constant: ['SCREAMING_SNAKE_CASE'],
    parameter: ['snake_case'],
    method: ['snake_case']
  },
  php: {
    function: ['camelCase', 'snake_case'],
    class: ['PascalCase'],
    variable: ['camelCase', 'snake_case'],
    constant: ['SCREAMING_SNAKE_CASE'],
    parameter: ['camelCase', 'snake_case'],
    method: ['camelCase']
  }
};

/**
 * Common abbreviations and acronyms that are acceptable in names.
 */
const COMMON_ABBREVIATIONS = new Set([
  'id', 'url', 'uri', 'api', 'db', 'sql', 'html', 'css', 'js', 'ts',
  'http', 'https', 'ftp', 'tcp', 'udp', 'ip', 'dns', 'ssh', 'ssl', 'tls',
  'json', 'xml', 'yaml', 'csv', 'pdf', 'png', 'jpg', 'gif', 'svg',
  'io', 'os', 'fs', 'cpu', 'gpu', 'ram', 'rom', 'hdd', 'ssd',
  'ui', 'ux', 'cli', 'gui', 'ide', 'sdk', 'jdk', 'npm', 'pip',
  'min', 'max', 'avg', 'sum', 'cnt', 'idx', 'len', 'num', 'str', 'int', 'bool',
  'src', 'dst', 'tmp', 'err', 'msg', 'req', 'res', 'ctx', 'cfg', 'env',
  'fn', 'cb', 'evt', 'el', 'dom', 'ref', 'ptr', 'buf', 'arr', 'obj',
  'init', 'exec', 'impl', 'util', 'async', 'sync'
]);

/**
 * Reserved words that should be avoided in names.
 */
const RESERVED_WORDS = {
  javascript: new Set([
    'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof',
    'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var',
    'void', 'while', 'with', 'class', 'const', 'enum', 'export', 'extends',
    'import', 'super', 'implements', 'interface', 'let', 'package', 'private',
    'protected', 'public', 'static', 'yield', 'await', 'async'
  ]),
  python: new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
    'while', 'with', 'yield'
  ]),
  java: new Set([
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch',
    'char', 'class', 'const', 'continue', 'default', 'do', 'double',
    'else', 'enum', 'extends', 'final', 'finally', 'float', 'for',
    'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface',
    'long', 'native', 'new', 'package', 'private', 'protected', 'public',
    'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized',
    'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while'
  ])
};

/**
 * Detect the naming convention of an identifier.
 * @param {string} name - The identifier name
 * @returns {string[]} Array of matching convention names
 */
const detectConvention = (name) => {
  const matches = [];
  for (const [convention, pattern] of Object.entries(NAMING_PATTERNS)) {
    if (pattern.test(name)) {
      matches.push(convention);
    }
  }
  return matches.length > 0 ? matches : ['unknown'];
};

/**
 * Check if a name follows the expected convention for its type and language.
 * @param {string} name - The identifier name
 * @param {string} type - The identifier type (function, class, variable, etc.)
 * @param {string} language - The programming language
 * @returns {Object} Compliance result
 */
const checkConvention = (name, type, language) => {
  const conventions = LANGUAGE_CONVENTIONS[language];
  if (!conventions) {
    return { compliant: true, expected: [], detected: detectConvention(name), reason: 'Unknown language' };
  }

  const expectedConventions = conventions[type] || conventions['variable'] || ['camelCase'];
  const detectedConventions = detectConvention(name);

  const compliant = expectedConventions.some(exp => detectedConventions.includes(exp));

  return {
    compliant,
    expected: expectedConventions,
    detected: detectedConventions,
    reason: compliant ? null : `Expected ${expectedConventions.join(' or ')}, found ${detectedConventions.join(', ')}`
  };
};

/**
 * Analyze identifier for potential issues.
 * @param {string} name - The identifier name
 * @param {string} language - The programming language
 * @returns {Object} Analysis result with issues
 */
const analyzeIdentifier = (name, language) => {
  const issues = [];

  // Check length
  if (name.length === 1 && !['i', 'j', 'k', 'n', 'x', 'y', 'z', '_'].includes(name)) {
    issues.push({ type: 'too_short', message: 'Single character names reduce readability' });
  }

  if (name.length > 40) {
    issues.push({ type: 'too_long', message: 'Name exceeds 40 characters' });
  }

  // Check for reserved words
  const reserved = RESERVED_WORDS[language] || RESERVED_WORDS.javascript;
  if (reserved.has(name)) {
    issues.push({ type: 'reserved_word', message: `'${name}' is a reserved word` });
  }

  // Check for leading/trailing underscores (except for private/protected convention)
  if (name.startsWith('__') && !name.endsWith('__')) {
    issues.push({ type: 'double_underscore', message: 'Double underscore prefix typically reserved for special methods' });
  }

  // Check for numbers at start (after potential underscore)
  const stripped = name.replace(/^_+/, '');
  if (/^[0-9]/.test(stripped)) {
    issues.push({ type: 'starts_with_number', message: 'Identifiers should not start with numbers' });
  }

  // Check for consecutive underscores
  if (/__+/.test(name) && !name.startsWith('__') && !name.endsWith('__')) {
    issues.push({ type: 'consecutive_underscores', message: 'Avoid consecutive underscores' });
  }

  // Check for mixed conventions (e.g., camelCase_with_snake)
  if (/[a-z][A-Z]/.test(name) && /_/.test(name)) {
    issues.push({ type: 'mixed_conventions', message: 'Mixed camelCase and snake_case' });
  }

  // Check for abbreviations
  const words = name.split(/(?=[A-Z])|_|-/).map(w => w.toLowerCase());
  const abbreviations = words.filter(w => w.length <= 3 && w.length > 0 && !COMMON_ABBREVIATIONS.has(w));
  if (abbreviations.length > 0) {
    issues.push({ type: 'uncommon_abbreviation', message: `Uncommon abbreviations: ${abbreviations.join(', ')}` });
  }

  return issues;
};

/**
 * Analyze naming conventions for a project.
 * @param {number} projectId - The project ID
 * @returns {Promise<Object>} Analysis results
 */
const analyze_project_naming = async (projectId) => {
  // Get all entities with their symbols
  const entities = await query`
    SELECT id, symbol, filename, type, language, start_line
    FROM entity
    WHERE project_id = ${projectId}
    ORDER BY filename, start_line
  `;

  const results = {
    summary: {
      total_identifiers: entities.length,
      compliant: 0,
      non_compliant: 0,
      with_issues: 0,
      by_convention: {},
      by_language: {},
      compliance_rate: 0
    },
    convention_distribution: {},
    violations: [],
    issues: [],
    by_file: {}
  };

  // Track conventions
  const conventionCounts = {};
  const languageCounts = {};

  for (const entity of entities) {
    const { symbol, filename, type, language, start_line } = entity;

    // Skip internal/generated names
    if (symbol.startsWith('__') && symbol.endsWith('__')) continue;
    if (symbol.startsWith('$')) continue;

    // Detect convention
    const detected = detectConvention(symbol);
    for (const conv of detected) {
      conventionCounts[conv] = (conventionCounts[conv] || 0) + 1;
    }

    // Track by language
    languageCounts[language] = languageCounts[language] || { total: 0, compliant: 0 };
    languageCounts[language].total++;

    // Check compliance
    const compliance = checkConvention(symbol, type, language);
    if (compliance.compliant) {
      results.summary.compliant++;
      languageCounts[language].compliant++;
    } else {
      results.summary.non_compliant++;
      results.violations.push({
        symbol,
        filename,
        line: start_line,
        type,
        language,
        expected: compliance.expected,
        detected: compliance.detected,
        reason: compliance.reason
      });
    }

    // Analyze for issues
    const identifierIssues = analyzeIdentifier(symbol, language);
    if (identifierIssues.length > 0) {
      results.summary.with_issues++;
      results.issues.push({
        symbol,
        filename,
        line: start_line,
        type,
        language,
        issues: identifierIssues
      });
    }

    // Group by file
    if (!results.by_file[filename]) {
      results.by_file[filename] = { compliant: 0, non_compliant: 0, issues: 0 };
    }
    if (compliance.compliant) {
      results.by_file[filename].compliant++;
    } else {
      results.by_file[filename].non_compliant++;
    }
    if (identifierIssues.length > 0) {
      results.by_file[filename].issues++;
    }
  }

  // Calculate summary stats
  results.summary.by_convention = conventionCounts;
  results.summary.by_language = Object.fromEntries(
    Object.entries(languageCounts).map(([lang, counts]) => [
      lang,
      {
        ...counts,
        compliance_rate: counts.total > 0 ? Math.round((counts.compliant / counts.total) * 100) : 100
      }
    ])
  );
  results.summary.compliance_rate = results.summary.total_identifiers > 0
    ? Math.round((results.summary.compliant / results.summary.total_identifiers) * 100)
    : 100;
  results.convention_distribution = conventionCounts;

  // Sort violations by file and line
  results.violations.sort((a, b) => {
    if (a.filename !== b.filename) return a.filename.localeCompare(b.filename);
    return a.line - b.line;
  });

  // Limit results for API response
  if (results.violations.length > 100) {
    results.violations_truncated = true;
    results.violations = results.violations.slice(0, 100);
  }
  if (results.issues.length > 100) {
    results.issues_truncated = true;
    results.issues = results.issues.slice(0, 100);
  }

  return results;
};

/**
 * Get naming convention summary for a specific file.
 * @param {number} projectId - The project ID
 * @param {string} filename - The filename to analyze
 * @returns {Promise<Object>} File-specific analysis
 */
const analyze_file_naming = async (projectId, filename) => {
  const entities = await query`
    SELECT id, symbol, filename, type, language, start_line
    FROM entity
    WHERE project_id = ${projectId}
      AND filename = ${filename}
    ORDER BY start_line
  `;

  const results = {
    filename,
    total: entities.length,
    compliant: 0,
    violations: [],
    issues: []
  };

  for (const entity of entities) {
    const { symbol, type, language, start_line } = entity;

    if (symbol.startsWith('__') && symbol.endsWith('__')) continue;
    if (symbol.startsWith('$')) continue;

    const compliance = checkConvention(symbol, type, language);
    if (compliance.compliant) {
      results.compliant++;
    } else {
      results.violations.push({
        symbol,
        line: start_line,
        type,
        expected: compliance.expected,
        detected: compliance.detected
      });
    }

    const identifierIssues = analyzeIdentifier(symbol, language);
    if (identifierIssues.length > 0) {
      results.issues.push({
        symbol,
        line: start_line,
        type,
        issues: identifierIssues
      });
    }
  }

  results.compliance_rate = results.total > 0
    ? Math.round((results.compliant / results.total) * 100)
    : 100;

  return results;
};

export {
  detectConvention,
  checkConvention,
  analyzeIdentifier,
  analyze_project_naming,
  analyze_file_naming,
  NAMING_PATTERNS,
  LANGUAGE_CONVENTIONS
};
