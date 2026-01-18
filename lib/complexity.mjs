'use strict';

/**
 * @fileoverview Code complexity metrics calculation.
 * Calculates cyclomatic complexity, nesting depth, lines of code,
 * and other metrics for C, JavaScript, and Python source code.
 * @module lib/complexity
 */

/**
 * Calculate cyclomatic complexity based on control flow statements.
 * Cyclomatic complexity = number of decision points + 1.
 * Higher values indicate more complex, harder-to-test code.
 * @param {string} source - The source code to analyze
 * @param {string} language - The programming language ('c', 'javascript', 'python')
 * @returns {number} The cyclomatic complexity score (minimum 1)
 */
const calculate_cyclomatic_complexity = (source, language) => {
  if (!source) return 1;

  // Decision point patterns for each language
  const patterns = {
    c: [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bswitch\s*\(/g,
      /\bcase\s+/g,
      /\?\s*.*:/g, // ternary operator
      /\&\&/g, // logical AND
      /\|\|/g, // logical OR
      /\bcatch\s*\(/g
    ],
    javascript: [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bfor\s*\(/g,
      /\bfor\s+of\b/g,
      /\bfor\s+in\b/g,
      /\bwhile\s*\(/g,
      /\bswitch\s*\(/g,
      /\bcase\s+/g,
      /\?\s*.*:/g, // ternary operator
      /\&\&/g, // logical AND
      /\|\|/g, // logical OR
      /\?\?/g, // nullish coalescing
      /\bcatch\s*\(/g,
      /\.catch\s*\(/g
    ],
    python: [
      /\bif\s+/g,
      /\belif\s+/g,
      /\bfor\s+/g,
      /\bwhile\s+/g,
      /\band\b/g,
      /\bor\b/g,
      /\bexcept\s*/g,
      /\bif\s+.*\s+else\s+/g // inline if-else
    ]
  };

  const lang_patterns = patterns[language] || patterns.c;
  let complexity = 1; // Base complexity

  for (const pattern of lang_patterns) {
    const matches = source.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
};

/**
 * Calculate maximum nesting depth of code blocks.
 * Counts brace depth for C-like languages, indentation for Python.
 * @param {string} source - The source code to analyze
 * @returns {number} The maximum nesting depth found
 */
const calculate_nesting_depth = (source) => {
  if (!source) return 0;

  let max_depth = 0;
  let current_depth = 0;

  for (const char of source) {
    if (char === '{') {
      current_depth++;
      max_depth = Math.max(max_depth, current_depth);
    } else if (char === '}') {
      current_depth = Math.max(0, current_depth - 1);
    }
  }

  // For Python, count indentation-based nesting
  if (!source.includes('{')) {
    const lines = source.split('\n');
    for (const line of lines) {
      if (line.trim() === '') continue;
      const leading_spaces = line.match(/^(\s*)/)[1].length;
      // Assuming 4 spaces or 1 tab per indent level
      const depth =
        Math.floor(leading_spaces / 4) || Math.floor(leading_spaces / 2);
      max_depth = Math.max(max_depth, depth);
    }
  }

  return max_depth;
};

/**
 * Count lines of code (excluding blank lines and comment-only lines).
 * @param {string} source - The source code to analyze
 * @returns {number} Number of non-blank, non-comment lines
 */
const calculate_loc = (source) => {
  if (!source) return 0;

  const lines = source.split('\n');
  let loc = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip blank lines
    if (trimmed === '') continue;
    // Skip single-line comments
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('*')
    )
      continue;
    // Skip multi-line comment markers
    if (trimmed.startsWith('/*') || trimmed.startsWith('*/')) continue;
    loc++;
  }

  return loc;
};

/**
 * Count number of parameters from a parameters string.
 * Handles nested generics and type annotations correctly.
 * @param {string} parameters - The parameters string (e.g., "(int x, int y)")
 * @returns {number} Number of parameters (0 for empty or void)
 */
const calculate_parameter_count = (parameters) => {
  if (!parameters || parameters === '()') return 0;

  // Remove parentheses and count commas + 1
  const inner = parameters.replace(/^\(/, '').replace(/\)$/, '').trim();
  if (inner === '' || inner === 'void') return 0;

  // Split by comma, accounting for nested generics/types
  let depth = 0;
  let count = 1;

  for (const char of inner) {
    if (char === '<' || char === '(' || char === '[') depth++;
    else if (char === '>' || char === ')' || char === ']') depth--;
    else if (char === ',' && depth === 0) count++;
  }

  return count;
};

/**
 * Get a human-readable complexity rating based on cyclomatic complexity.
 * @param {number} cyclomatic - The cyclomatic complexity score
 * @returns {Object} Rating object with { rating, color, label }
 * @returns {string} returns.rating - Rating level ('low', 'moderate', 'high', 'very_high')
 * @returns {string} returns.color - Hex color code for visualization
 * @returns {string} returns.label - Human-readable label
 */
const get_complexity_rating = (cyclomatic) => {
  if (cyclomatic <= 5)
    return { rating: 'low', color: '#4caf50', label: 'Simple' };
  if (cyclomatic <= 10)
    return { rating: 'moderate', color: '#ff9800', label: 'Moderate' };
  if (cyclomatic <= 20)
    return { rating: 'high', color: '#f44336', label: 'Complex' };
  return { rating: 'very_high', color: '#9c27b0', label: 'Very Complex' };
};

/**
 * Calculate all complexity metrics for a function entity.
 * @param {Object} entity - The function entity to analyze
 * @param {string} entity.source - The function source code
 * @param {string} [entity.parameters] - The function parameters string
 * @param {string} [entity.language='c'] - The programming language
 * @returns {Object} Complexity metrics including cyclomatic, nesting_depth, loc, parameter_count, and rating
 */
const calculate_complexity = (entity) => {
  const { source, parameters, language = 'c' } = entity;

  const cyclomatic = calculate_cyclomatic_complexity(source, language);
  const nesting_depth = calculate_nesting_depth(source);
  const loc = calculate_loc(source);
  const parameter_count = calculate_parameter_count(parameters);
  const rating = get_complexity_rating(cyclomatic);

  return {
    cyclomatic,
    nesting_depth,
    loc,
    parameter_count,
    ...rating
  };
};

/**
 * Calculate aggregate complexity metrics for a collection of functions.
 * Useful for project or file-level complexity analysis.
 * @param {Object[]} entities - Array of function entities to analyze
 * @returns {Object} Aggregate metrics including averages, totals, and distribution
 * @returns {number} returns.total_functions - Number of functions analyzed
 * @returns {number} returns.avg_cyclomatic - Average cyclomatic complexity
 * @returns {number} returns.max_cyclomatic - Maximum cyclomatic complexity
 * @returns {number} returns.avg_loc - Average lines of code per function
 * @returns {number} returns.total_loc - Total lines of code
 * @returns {number} returns.avg_nesting_depth - Average nesting depth
 * @returns {number} returns.max_nesting_depth - Maximum nesting depth
 * @returns {Object} returns.complexity_distribution - Count by rating level
 */
const calculate_aggregate_complexity = (entities) => {
  if (!entities || entities.length === 0) {
    return {
      total_functions: 0,
      avg_cyclomatic: 0,
      max_cyclomatic: 0,
      avg_loc: 0,
      total_loc: 0,
      avg_nesting_depth: 0,
      max_nesting_depth: 0,
      complexity_distribution: { low: 0, moderate: 0, high: 0, very_high: 0 }
    };
  }

  const complexities = entities.map((e) => calculate_complexity(e));

  const total_functions = complexities.length;
  const total_cyclomatic = complexities.reduce(
    (sum, c) => sum + c.cyclomatic,
    0
  );
  const total_loc = complexities.reduce((sum, c) => sum + c.loc, 0);
  const total_nesting = complexities.reduce(
    (sum, c) => sum + c.nesting_depth,
    0
  );

  const distribution = { low: 0, moderate: 0, high: 0, very_high: 0 };
  for (const c of complexities) {
    distribution[c.rating]++;
  }

  // Use reduce instead of Math.max(...array) to avoid stack overflow on large arrays
  const max_cyclomatic = complexities.reduce(
    (max, c) => Math.max(max, c.cyclomatic),
    0
  );
  const max_nesting_depth = complexities.reduce(
    (max, c) => Math.max(max, c.nesting_depth),
    0
  );

  return {
    total_functions,
    avg_cyclomatic: Math.round((total_cyclomatic / total_functions) * 10) / 10,
    max_cyclomatic,
    avg_loc: Math.round((total_loc / total_functions) * 10) / 10,
    total_loc,
    avg_nesting_depth: Math.round((total_nesting / total_functions) * 10) / 10,
    max_nesting_depth,
    complexity_distribution: distribution
  };
};

export {
  calculate_complexity,
  calculate_aggregate_complexity,
  calculate_cyclomatic_complexity,
  calculate_nesting_depth,
  calculate_loc,
  calculate_parameter_count,
  get_complexity_rating
};
