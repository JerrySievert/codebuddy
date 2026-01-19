'use strict';

/**
 * @fileoverview Code readability scoring module.
 * Quantifies how readable/maintainable code is using multiple metrics.
 * Computed on-demand from source code - no database changes required.
 * @module lib/readability
 */

import { query } from '../db.mjs';

/**
 * Weights for different readability factors.
 * Higher weight = more impact on final score.
 */
const READABILITY_WEIGHTS = {
  identifier_length: 0.15,
  comment_ratio: 0.1,
  function_length: 0.2,
  nesting_depth: 0.2,
  line_length: 0.1,
  magic_numbers: 0.1,
  boolean_complexity: 0.15
};

/**
 * Thresholds for readability metrics.
 */
const THRESHOLDS = {
  identifier_length: {
    min_good: 3,
    max_good: 25,
    min_acceptable: 2,
    max_acceptable: 35
  },
  function_length: {
    excellent: 20,
    good: 50,
    acceptable: 100,
    poor: 200
  },
  nesting_depth: {
    excellent: 2,
    good: 3,
    acceptable: 4,
    poor: 6
  },
  line_length: {
    excellent: 80,
    good: 100,
    acceptable: 120,
    poor: 150
  },
  comment_ratio: {
    excellent: 0.2, // 20% comments
    good: 0.1,
    acceptable: 0.05,
    poor: 0.02
  },
  magic_numbers: {
    excellent: 0,
    good: 2,
    acceptable: 5,
    poor: 10
  },
  boolean_operators: {
    excellent: 2,
    good: 3,
    acceptable: 5,
    poor: 7
  }
};

/**
 * Magic numbers that are acceptable and shouldn't be flagged.
 */
const ACCEPTABLE_MAGIC_NUMBERS = new Set([
  -1,
  0,
  1,
  2,
  10,
  100,
  1000,
  24,
  60,
  365, // Time-related
  256,
  512,
  1024,
  2048,
  4096, // Powers of 2
  0.5,
  0.0,
  1.0,
  2.0 // Common floats
]);

/**
 * Calculate score from 0-100 based on value and thresholds.
 * @param {number} value - The measured value
 * @param {Object} thresholds - Threshold levels
 * @param {boolean} lower_is_better - Whether lower values are better
 * @returns {number} Score from 0-100
 */
const calculate_score = (value, thresholds, lower_is_better = true) => {
  if (lower_is_better) {
    if (value <= thresholds.excellent) return 100;
    if (value <= thresholds.good) return 85;
    if (value <= thresholds.acceptable) return 70;
    if (value <= thresholds.poor) return 50;
    return Math.max(0, 50 - (value - thresholds.poor) * 2);
  } else {
    if (value >= thresholds.excellent) return 100;
    if (value >= thresholds.good) return 85;
    if (value >= thresholds.acceptable) return 70;
    if (value >= thresholds.poor) return 50;
    return Math.max(0, 50 - (thresholds.poor - value) * 10);
  }
};

/**
 * Analyze identifier lengths in source code.
 * @param {string} source - Source code
 * @returns {Object} Identifier length analysis
 */
const analyze_identifier_lengths = (source) => {
  // Extract identifiers (simplified regex approach)
  const identifier_pattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  const identifiers = [];
  let match;

  while ((match = identifier_pattern.exec(source)) !== null) {
    const name = match[1];
    // Skip keywords and very common names
    if (name.length > 1 || ['i', 'j', 'k', 'n', 'x', 'y', 'z'].includes(name)) {
      identifiers.push(name);
    }
  }

  if (identifiers.length === 0) {
    return { score: 100, avg_length: 0, too_short: 0, too_long: 0, total: 0 };
  }

  const lengths = identifiers.map((id) => id.length);
  const avg_length = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  const too_short = lengths.filter(
    (l) => l < THRESHOLDS.identifier_length.min_acceptable
  ).length;
  const too_long = lengths.filter(
    (l) => l > THRESHOLDS.identifier_length.max_acceptable
  ).length;

  const good_count = lengths.filter(
    (l) =>
      l >= THRESHOLDS.identifier_length.min_good &&
      l <= THRESHOLDS.identifier_length.max_good
  ).length;

  const score = Math.round((good_count / identifiers.length) * 100);

  return {
    score,
    avg_length: Math.round(avg_length * 10) / 10,
    too_short: too_short,
    too_long: too_long,
    total: identifiers.length
  };
};

/**
 * Analyze comment to code ratio.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {Object} Comment ratio analysis
 */
const analyze_comment_ratio = (source, language) => {
  const lines = source.split('\n');
  let code_lines = 0;
  let comment_lines = 0;
  let blank_lines = 0;

  // Language-specific comment patterns
  const single_line_comment = {
    javascript: /^\s*\/\//,
    typescript: /^\s*\/\//,
    python: /^\s*#/,
    java: /^\s*\/\//,
    go: /^\s*\/\//,
    rust: /^\s*\/\//,
    c: /^\s*\/\//,
    cpp: /^\s*\/\//,
    ruby: /^\s*#/,
    php: /^\s*(\/\/|#)/
  };

  const pattern = single_line_comment[language] || /^\s*(\/\/|#)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      blank_lines++;
    } else if (pattern.test(line)) {
      comment_lines++;
    } else {
      code_lines++;
    }
  }

  // Also count inline comments roughly
  const inline_comment_pattern = /\/\/.*$|#.*$/gm;
  const inline_comments = (source.match(inline_comment_pattern) || []).length;

  const total_lines = code_lines + comment_lines;
  const ratio = total_lines > 0 ? comment_lines / total_lines : 0;

  const score = calculate_score(ratio, THRESHOLDS.comment_ratio, false);

  return {
    score: Math.round(score),
    ratio: Math.round(ratio * 100) / 100,
    comment_lines: comment_lines,
    code_lines: code_lines,
    blank_lines: blank_lines,
    inline_comments: inline_comments
  };
};

/**
 * Analyze function/method lengths.
 * @param {number} lineCount - Number of lines in function
 * @returns {Object} Function length analysis
 */
const analyze_function_length = (line_count) => {
  const score = calculate_score(line_count, THRESHOLDS.function_length, true);

  let rating;
  if (line_count <= THRESHOLDS.function_length.excellent) rating = 'excellent';
  else if (line_count <= THRESHOLDS.function_length.good) rating = 'good';
  else if (line_count <= THRESHOLDS.function_length.acceptable)
    rating = 'acceptable';
  else if (line_count <= THRESHOLDS.function_length.poor) rating = 'poor';
  else rating = 'very_poor';

  return {
    score: Math.round(score),
    lines: line_count,
    rating
  };
};

/**
 * Analyze nesting depth in source code.
 * @param {string} source - Source code
 * @returns {Object} Nesting depth analysis
 */
const analyze_nesting_depth = (source) => {
  const lines = source.split('\n');
  let max_depth = 0;
  let current_depth = 0;
  let total_depth = 0;
  let depth_count = 0;

  for (const line of lines) {
    // Count opening and closing braces/indentation
    const opens = (line.match(/\{|\[|\(/g) || []).length;
    const closes = (line.match(/\}|\]|\)/g) || []).length;

    current_depth += opens;
    if (current_depth > max_depth) max_depth = current_depth;

    if (line.trim() && current_depth > 0) {
      total_depth += current_depth;
      depth_count++;
    }

    current_depth -= closes;
    if (current_depth < 0) current_depth = 0;
  }

  const avg_depth = depth_count > 0 ? total_depth / depth_count : 0;
  const score = calculate_score(max_depth, THRESHOLDS.nesting_depth, true);

  return {
    score: Math.round(score),
    max_depth: max_depth,
    avg_depth: Math.round(avg_depth * 10) / 10
  };
};

/**
 * Analyze line lengths in source code.
 * @param {string} source - Source code
 * @returns {Object} Line length analysis
 */
const analyze_line_lengths = (source) => {
  const lines = source.split('\n');
  const lengths = lines.map((l) => l.length).filter((l) => l > 0);

  if (lengths.length === 0) {
    return {
      score: 100,
      max_length: 0,
      avg_length: 0,
      over_80: 0,
      over_120: 0
    };
  }

  const max_length = Math.max(...lengths);
  const avg_length = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const over_80 = lengths.filter((l) => l > 80).length;
  const over_120 = lengths.filter((l) => l > 120).length;

  const score = calculate_score(max_length, THRESHOLDS.line_length, true);

  // Penalize if many lines are over limit
  const over_limit_penalty = Math.min(30, (over_120 / lengths.length) * 100);

  return {
    score: Math.max(0, Math.round(score - over_limit_penalty)),
    max_length: max_length,
    avg_length: Math.round(avg_length),
    over_80: over_80,
    over_120: over_120,
    total_lines: lengths.length
  };
};

/**
 * Detect magic numbers in source code.
 * @param {string} source - Source code
 * @returns {Object} Magic number analysis
 */
const detect_magic_numbers = (source) => {
  // Match numbers not in obvious constant definitions
  const number_pattern = /(?<![\w.])\b(\d+\.?\d*)\b(?![\w.])/g;
  const magic_numbers = [];
  let match;

  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comment lines
    if (/^\s*(\/\/|#|\/\*)/.test(line)) continue;

    // Skip constant definitions
    if (/\b(const|final|static|#define|CONST)\b/i.test(line)) continue;

    // Skip array indices and common patterns
    if (/\[\s*\d+\s*\]/.test(line)) continue;

    while ((match = number_pattern.exec(line)) !== null) {
      const num = parseFloat(match[1]);
      if (!ACCEPTABLE_MAGIC_NUMBERS.has(num) && !isNaN(num)) {
        magic_numbers.push({
          value: num,
          line: i + 1,
          context: line.trim().substring(0, 60)
        });
      }
    }
  }

  const count = magic_numbers.length;
  const score = calculate_score(count, THRESHOLDS.magic_numbers, true);

  return {
    score: Math.round(score),
    count,
    numbers: magic_numbers.slice(0, 20) // Limit to first 20
  };
};

/**
 * Analyze boolean expression complexity.
 * @param {string} source - Source code
 * @returns {Object} Boolean complexity analysis
 */
const analyze_boolean_complexity = (source) => {
  // Find lines with boolean operators
  const boolean_pattern = /&&|\|\||and\s|or\s|\bnot\s/gi;
  const lines = source.split('\n');
  let max_operators = 0;
  let total_operators = 0;
  let complex_expressions = 0;
  const complex_lines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(boolean_pattern) || [];
    const count = matches.length;

    if (count > 0) {
      total_operators += count;
      if (count > max_operators) max_operators = count;

      if (count >= THRESHOLDS.boolean_operators.acceptable) {
        complex_expressions++;
        complex_lines.push({
          line: i + 1,
          operators: count,
          content: line.trim().substring(0, 80)
        });
      }
    }
  }

  const score = calculate_score(
    max_operators,
    THRESHOLDS.boolean_operators,
    true
  );

  return {
    score: Math.round(score),
    max_operators: max_operators,
    total_operators: total_operators,
    complex_expressions: complex_expressions,
    examples: complex_lines.slice(0, 10)
  };
};

/**
 * Calculate overall readability score for source code.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {Object} Complete readability analysis
 */
const calculate_readability_score = (source, language) => {
  const identifiers = analyze_identifier_lengths(source);
  const comments = analyze_comment_ratio(source, language);
  const nesting = analyze_nesting_depth(source);
  const line_length = analyze_line_lengths(source);
  const magic_numbers = detect_magic_numbers(source);
  const boolean_complexity = analyze_boolean_complexity(source);

  // Calculate weighted score
  const weighted_score =
    identifiers.score * READABILITY_WEIGHTS.identifier_length +
    comments.score * READABILITY_WEIGHTS.comment_ratio +
    nesting.score * READABILITY_WEIGHTS.nesting_depth +
    line_length.score * READABILITY_WEIGHTS.line_length +
    magic_numbers.score * READABILITY_WEIGHTS.magic_numbers +
    boolean_complexity.score * READABILITY_WEIGHTS.boolean_complexity;

  // Function length is analyzed separately per-function
  const overall_score = Math.round(
    weighted_score / (1 - READABILITY_WEIGHTS.function_length)
  );

  let rating;
  if (overall_score >= 85) rating = 'excellent';
  else if (overall_score >= 70) rating = 'good';
  else if (overall_score >= 55) rating = 'acceptable';
  else if (overall_score >= 40) rating = 'poor';
  else rating = 'very_poor';

  return {
    score: overall_score,
    rating,
    breakdown: {
      identifier_length: identifiers,
      comment_ratio: comments,
      nesting_depth: nesting,
      line_length: line_length,
      magic_numbers: magic_numbers,
      boolean_complexity: boolean_complexity
    },
    weights: READABILITY_WEIGHTS
  };
};

/**
 * Analyze readability for a project.
 * @param {number} projectId - The project ID
 * @returns {Promise<Object>} Project readability analysis
 */
const analyze_project_readability = async (project_id) => {
  // Get all entities with source
  const entities = await query`
    SELECT id, symbol, filename, type, language, source, start_line, end_line
    FROM entity
    WHERE project_id = ${project_id}
      AND source IS NOT NULL
    ORDER BY filename, start_line
  `;

  const results = {
    summary: {
      total_functions: entities.length,
      avg_score: 0,
      score_distribution: {
        excellent: 0,
        good: 0,
        acceptable: 0,
        poor: 0,
        very_poor: 0
      },
      by_language: {}
    },
    metrics: {
      avg_function_length: 0,
      avg_nesting_depth: 0,
      avg_line_length: 0,
      total_magic_numbers: 0,
      total_complex_booleans: 0
    },
    worst_functions: [],
    best_functions: [],
    by_file: {}
  };

  if (entities.length === 0) {
    return results;
  }

  let total_score = 0;
  let total_function_length = 0;
  let total_nesting_depth = 0;
  let total_line_length = 0;
  let total_magic_numbers = 0;
  let total_complex_booleans = 0;

  const function_scores = [];
  const language_stats = {};

  for (const entity of entities) {
    const { symbol, filename, type, language, source, start_line, end_line } =
      entity;

    if (!source) continue;

    const line_count = (end_line || start_line) - start_line + 1;
    const function_length = analyze_function_length(line_count);
    const readability = calculate_readability_score(source, language);

    // Combine function length into overall score
    const combined_score = Math.round(
      readability.score * (1 - READABILITY_WEIGHTS.function_length) +
        function_length.score * READABILITY_WEIGHTS.function_length
    );

    total_score += combined_score;
    total_function_length += line_count;
    total_nesting_depth += readability.breakdown.nesting_depth.max_depth;
    total_line_length += readability.breakdown.line_length.avg_length;
    total_magic_numbers += readability.breakdown.magic_numbers.count;
    total_complex_booleans +=
      readability.breakdown.boolean_complexity.complex_expressions;

    // Track by rating
    let rating;
    if (combined_score >= 85) {
      rating = 'excellent';
      results.summary.score_distribution.excellent++;
    } else if (combined_score >= 70) {
      rating = 'good';
      results.summary.score_distribution.good++;
    } else if (combined_score >= 55) {
      rating = 'acceptable';
      results.summary.score_distribution.acceptable++;
    } else if (combined_score >= 40) {
      rating = 'poor';
      results.summary.score_distribution.poor++;
    } else {
      rating = 'very_poor';
      results.summary.score_distribution.very_poor++;
    }

    // Track by language
    if (!language_stats[language]) {
      language_stats[language] = { total: 0, sum_score: 0 };
    }
    language_stats[language].total++;
    language_stats[language].sum_score += combined_score;

    // Track by file
    if (!results.by_file[filename]) {
      results.by_file[filename] = { count: 0, sum_score: 0, avg_score: 0 };
    }
    results.by_file[filename].count++;
    results.by_file[filename].sum_score += combined_score;

    function_scores.push({
      symbol,
      filename,
      line: start_line,
      type,
      language,
      score: combined_score,
      rating,
      lines: line_count,
      issues: {
        nesting_depth: readability.breakdown.nesting_depth.max_depth,
        magic_numbers: readability.breakdown.magic_numbers.count,
        complex_booleans:
          readability.breakdown.boolean_complexity.complex_expressions,
        max_line_length: readability.breakdown.line_length.max_length
      }
    });
  }

  // Calculate averages
  const count = entities.length;
  results.summary.avg_score = Math.round(total_score / count);
  results.metrics.avg_function_length = Math.round(
    total_function_length / count
  );
  results.metrics.avg_nesting_depth =
    Math.round((total_nesting_depth / count) * 10) / 10;
  results.metrics.avg_line_length = Math.round(total_line_length / count);
  results.metrics.total_magic_numbers = total_magic_numbers;
  results.metrics.total_complex_booleans = total_complex_booleans;

  // Calculate by-language stats
  for (const [lang, stats] of Object.entries(language_stats)) {
    results.summary.by_language[lang] = {
      count: stats.total,
      avg_score: Math.round(stats.sum_score / stats.total)
    };
  }

  // Calculate by-file averages
  for (const filename of Object.keys(results.by_file)) {
    const file = results.by_file[filename];
    file.avg_score = Math.round(file.sum_score / file.count);
    delete file.sum_score;
  }

  // Sort and get best/worst
  function_scores.sort((a, b) => a.score - b.score);
  results.worst_functions = function_scores.slice(0, 10);
  results.best_functions = function_scores.slice(-10).reverse();

  return results;
};

export {
  calculate_readability_score,
  analyze_project_readability,
  analyze_identifier_lengths,
  analyze_comment_ratio,
  analyze_function_length,
  analyze_nesting_depth,
  analyze_line_lengths,
  detect_magic_numbers,
  analyze_boolean_complexity,
  READABILITY_WEIGHTS,
  THRESHOLDS
};
