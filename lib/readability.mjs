'use strict';

/**
 * @fileoverview Code readability scoring module.
 * Quantifies how readable/maintainable code is using multiple metrics.
 * Computed on-demand from source code - no database changes required.
 * @module lib/readability
 */

import { query } from './db.mjs';

/**
 * Weights for different readability factors.
 * Higher weight = more impact on final score.
 */
const READABILITY_WEIGHTS = {
  identifier_length: 0.15,
  comment_ratio: 0.10,
  function_length: 0.20,
  nesting_depth: 0.20,
  line_length: 0.10,
  magic_numbers: 0.10,
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
    excellent: 0.20,  // 20% comments
    good: 0.10,
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
  -1, 0, 1, 2, 10, 100, 1000,
  24, 60, 365,  // Time-related
  256, 512, 1024, 2048, 4096,  // Powers of 2
  0.5, 0.0, 1.0, 2.0  // Common floats
]);

/**
 * Calculate score from 0-100 based on value and thresholds.
 * @param {number} value - The measured value
 * @param {Object} thresholds - Threshold levels
 * @param {boolean} lowerIsBetter - Whether lower values are better
 * @returns {number} Score from 0-100
 */
const calculateScore = (value, thresholds, lowerIsBetter = true) => {
  if (lowerIsBetter) {
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
const analyzeIdentifierLengths = (source) => {
  // Extract identifiers (simplified regex approach)
  const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  const identifiers = [];
  let match;

  while ((match = identifierPattern.exec(source)) !== null) {
    const name = match[1];
    // Skip keywords and very common names
    if (name.length > 1 || ['i', 'j', 'k', 'n', 'x', 'y', 'z'].includes(name)) {
      identifiers.push(name);
    }
  }

  if (identifiers.length === 0) {
    return { score: 100, avg_length: 0, too_short: 0, too_long: 0, total: 0 };
  }

  const lengths = identifiers.map(id => id.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  const tooShort = lengths.filter(l => l < THRESHOLDS.identifier_length.min_acceptable).length;
  const tooLong = lengths.filter(l => l > THRESHOLDS.identifier_length.max_acceptable).length;

  const goodCount = lengths.filter(
    l => l >= THRESHOLDS.identifier_length.min_good && l <= THRESHOLDS.identifier_length.max_good
  ).length;

  const score = Math.round((goodCount / identifiers.length) * 100);

  return {
    score,
    avg_length: Math.round(avgLength * 10) / 10,
    too_short: tooShort,
    too_long: tooLong,
    total: identifiers.length
  };
};

/**
 * Analyze comment to code ratio.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {Object} Comment ratio analysis
 */
const analyzeCommentRatio = (source, language) => {
  const lines = source.split('\n');
  let codeLines = 0;
  let commentLines = 0;
  let blankLines = 0;

  // Language-specific comment patterns
  const singleLineComment = {
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

  const pattern = singleLineComment[language] || /^\s*(\/\/|#)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      blankLines++;
    } else if (pattern.test(line)) {
      commentLines++;
    } else {
      codeLines++;
    }
  }

  // Also count inline comments roughly
  const inlineCommentPattern = /\/\/.*$|#.*$/gm;
  const inlineComments = (source.match(inlineCommentPattern) || []).length;

  const totalLines = codeLines + commentLines;
  const ratio = totalLines > 0 ? commentLines / totalLines : 0;

  const score = calculateScore(ratio, THRESHOLDS.comment_ratio, false);

  return {
    score: Math.round(score),
    ratio: Math.round(ratio * 100) / 100,
    comment_lines: commentLines,
    code_lines: codeLines,
    blank_lines: blankLines,
    inline_comments: inlineComments
  };
};

/**
 * Analyze function/method lengths.
 * @param {number} lineCount - Number of lines in function
 * @returns {Object} Function length analysis
 */
const analyzeFunctionLength = (lineCount) => {
  const score = calculateScore(lineCount, THRESHOLDS.function_length, true);

  let rating;
  if (lineCount <= THRESHOLDS.function_length.excellent) rating = 'excellent';
  else if (lineCount <= THRESHOLDS.function_length.good) rating = 'good';
  else if (lineCount <= THRESHOLDS.function_length.acceptable) rating = 'acceptable';
  else if (lineCount <= THRESHOLDS.function_length.poor) rating = 'poor';
  else rating = 'very_poor';

  return {
    score: Math.round(score),
    lines: lineCount,
    rating
  };
};

/**
 * Analyze nesting depth in source code.
 * @param {string} source - Source code
 * @returns {Object} Nesting depth analysis
 */
const analyzeNestingDepth = (source) => {
  const lines = source.split('\n');
  let maxDepth = 0;
  let currentDepth = 0;
  let totalDepth = 0;
  let depthCount = 0;

  for (const line of lines) {
    // Count opening and closing braces/indentation
    const opens = (line.match(/\{|\[|\(/g) || []).length;
    const closes = (line.match(/\}|\]|\)/g) || []).length;

    currentDepth += opens;
    if (currentDepth > maxDepth) maxDepth = currentDepth;

    if (line.trim() && currentDepth > 0) {
      totalDepth += currentDepth;
      depthCount++;
    }

    currentDepth -= closes;
    if (currentDepth < 0) currentDepth = 0;
  }

  const avgDepth = depthCount > 0 ? totalDepth / depthCount : 0;
  const score = calculateScore(maxDepth, THRESHOLDS.nesting_depth, true);

  return {
    score: Math.round(score),
    max_depth: maxDepth,
    avg_depth: Math.round(avgDepth * 10) / 10
  };
};

/**
 * Analyze line lengths in source code.
 * @param {string} source - Source code
 * @returns {Object} Line length analysis
 */
const analyzeLineLengths = (source) => {
  const lines = source.split('\n');
  const lengths = lines.map(l => l.length).filter(l => l > 0);

  if (lengths.length === 0) {
    return { score: 100, max_length: 0, avg_length: 0, over_80: 0, over_120: 0 };
  }

  const maxLength = Math.max(...lengths);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const over80 = lengths.filter(l => l > 80).length;
  const over120 = lengths.filter(l => l > 120).length;

  const score = calculateScore(maxLength, THRESHOLDS.line_length, true);

  // Penalize if many lines are over limit
  const overLimitPenalty = Math.min(30, (over120 / lengths.length) * 100);

  return {
    score: Math.max(0, Math.round(score - overLimitPenalty)),
    max_length: maxLength,
    avg_length: Math.round(avgLength),
    over_80: over80,
    over_120: over120,
    total_lines: lengths.length
  };
};

/**
 * Detect magic numbers in source code.
 * @param {string} source - Source code
 * @returns {Object} Magic number analysis
 */
const detectMagicNumbers = (source) => {
  // Match numbers not in obvious constant definitions
  const numberPattern = /(?<![\w.])\b(\d+\.?\d*)\b(?![\w.])/g;
  const magicNumbers = [];
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

    while ((match = numberPattern.exec(line)) !== null) {
      const num = parseFloat(match[1]);
      if (!ACCEPTABLE_MAGIC_NUMBERS.has(num) && !isNaN(num)) {
        magicNumbers.push({
          value: num,
          line: i + 1,
          context: line.trim().substring(0, 60)
        });
      }
    }
  }

  const count = magicNumbers.length;
  const score = calculateScore(count, THRESHOLDS.magic_numbers, true);

  return {
    score: Math.round(score),
    count,
    numbers: magicNumbers.slice(0, 20)  // Limit to first 20
  };
};

/**
 * Analyze boolean expression complexity.
 * @param {string} source - Source code
 * @returns {Object} Boolean complexity analysis
 */
const analyzeBooleanComplexity = (source) => {
  // Find lines with boolean operators
  const booleanPattern = /&&|\|\||and\s|or\s|\bnot\s/gi;
  const lines = source.split('\n');
  let maxOperators = 0;
  let totalOperators = 0;
  let complexExpressions = 0;
  const complexLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(booleanPattern) || [];
    const count = matches.length;

    if (count > 0) {
      totalOperators += count;
      if (count > maxOperators) maxOperators = count;

      if (count >= THRESHOLDS.boolean_operators.acceptable) {
        complexExpressions++;
        complexLines.push({
          line: i + 1,
          operators: count,
          content: line.trim().substring(0, 80)
        });
      }
    }
  }

  const score = calculateScore(maxOperators, THRESHOLDS.boolean_operators, true);

  return {
    score: Math.round(score),
    max_operators: maxOperators,
    total_operators: totalOperators,
    complex_expressions: complexExpressions,
    examples: complexLines.slice(0, 10)
  };
};

/**
 * Calculate overall readability score for source code.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {Object} Complete readability analysis
 */
const calculateReadabilityScore = (source, language) => {
  const identifiers = analyzeIdentifierLengths(source);
  const comments = analyzeCommentRatio(source, language);
  const nesting = analyzeNestingDepth(source);
  const lineLength = analyzeLineLengths(source);
  const magicNumbers = detectMagicNumbers(source);
  const booleanComplexity = analyzeBooleanComplexity(source);

  // Calculate weighted score
  const weightedScore =
    identifiers.score * READABILITY_WEIGHTS.identifier_length +
    comments.score * READABILITY_WEIGHTS.comment_ratio +
    nesting.score * READABILITY_WEIGHTS.nesting_depth +
    lineLength.score * READABILITY_WEIGHTS.line_length +
    magicNumbers.score * READABILITY_WEIGHTS.magic_numbers +
    booleanComplexity.score * READABILITY_WEIGHTS.boolean_complexity;

  // Function length is analyzed separately per-function
  const overallScore = Math.round(weightedScore / (1 - READABILITY_WEIGHTS.function_length));

  let rating;
  if (overallScore >= 85) rating = 'excellent';
  else if (overallScore >= 70) rating = 'good';
  else if (overallScore >= 55) rating = 'acceptable';
  else if (overallScore >= 40) rating = 'poor';
  else rating = 'very_poor';

  return {
    score: overallScore,
    rating,
    breakdown: {
      identifier_length: identifiers,
      comment_ratio: comments,
      nesting_depth: nesting,
      line_length: lineLength,
      magic_numbers: magicNumbers,
      boolean_complexity: booleanComplexity
    },
    weights: READABILITY_WEIGHTS
  };
};

/**
 * Analyze readability for a project.
 * @param {number} projectId - The project ID
 * @returns {Promise<Object>} Project readability analysis
 */
const analyze_project_readability = async (projectId) => {
  // Get all entities with source
  const entities = await query`
    SELECT id, symbol, filename, type, language, source, start_line, end_line
    FROM entity
    WHERE project_id = ${projectId}
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

  let totalScore = 0;
  let totalFunctionLength = 0;
  let totalNestingDepth = 0;
  let totalLineLength = 0;
  let totalMagicNumbers = 0;
  let totalComplexBooleans = 0;

  const functionScores = [];
  const languageStats = {};

  for (const entity of entities) {
    const { symbol, filename, type, language, source, start_line, end_line } = entity;

    if (!source) continue;

    const lineCount = (end_line || start_line) - start_line + 1;
    const functionLength = analyzeFunctionLength(lineCount);
    const readability = calculateReadabilityScore(source, language);

    // Combine function length into overall score
    const combinedScore = Math.round(
      readability.score * (1 - READABILITY_WEIGHTS.function_length) +
      functionLength.score * READABILITY_WEIGHTS.function_length
    );

    totalScore += combinedScore;
    totalFunctionLength += lineCount;
    totalNestingDepth += readability.breakdown.nesting_depth.max_depth;
    totalLineLength += readability.breakdown.line_length.avg_length;
    totalMagicNumbers += readability.breakdown.magic_numbers.count;
    totalComplexBooleans += readability.breakdown.boolean_complexity.complex_expressions;

    // Track by rating
    let rating;
    if (combinedScore >= 85) { rating = 'excellent'; results.summary.score_distribution.excellent++; }
    else if (combinedScore >= 70) { rating = 'good'; results.summary.score_distribution.good++; }
    else if (combinedScore >= 55) { rating = 'acceptable'; results.summary.score_distribution.acceptable++; }
    else if (combinedScore >= 40) { rating = 'poor'; results.summary.score_distribution.poor++; }
    else { rating = 'very_poor'; results.summary.score_distribution.very_poor++; }

    // Track by language
    if (!languageStats[language]) {
      languageStats[language] = { total: 0, sum_score: 0 };
    }
    languageStats[language].total++;
    languageStats[language].sum_score += combinedScore;

    // Track by file
    if (!results.by_file[filename]) {
      results.by_file[filename] = { count: 0, sum_score: 0, avg_score: 0 };
    }
    results.by_file[filename].count++;
    results.by_file[filename].sum_score += combinedScore;

    functionScores.push({
      symbol,
      filename,
      line: start_line,
      type,
      language,
      score: combinedScore,
      rating,
      lines: lineCount,
      issues: {
        nesting_depth: readability.breakdown.nesting_depth.max_depth,
        magic_numbers: readability.breakdown.magic_numbers.count,
        complex_booleans: readability.breakdown.boolean_complexity.complex_expressions,
        max_line_length: readability.breakdown.line_length.max_length
      }
    });
  }

  // Calculate averages
  const count = entities.length;
  results.summary.avg_score = Math.round(totalScore / count);
  results.metrics.avg_function_length = Math.round(totalFunctionLength / count);
  results.metrics.avg_nesting_depth = Math.round((totalNestingDepth / count) * 10) / 10;
  results.metrics.avg_line_length = Math.round(totalLineLength / count);
  results.metrics.total_magic_numbers = totalMagicNumbers;
  results.metrics.total_complex_booleans = totalComplexBooleans;

  // Calculate by-language stats
  for (const [lang, stats] of Object.entries(languageStats)) {
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
  functionScores.sort((a, b) => a.score - b.score);
  results.worst_functions = functionScores.slice(0, 10);
  results.best_functions = functionScores.slice(-10).reverse();

  return results;
};

/**
 * Analyze readability for a specific function.
 * @param {number} entityId - The entity ID
 * @returns {Promise<Object>} Function readability analysis
 */
const analyze_function_readability = async (entityId) => {
  const entities = await query`
    SELECT id, symbol, filename, type, language, source, start_line, end_line
    FROM entity
    WHERE id = ${entityId}
  `;

  if (entities.length === 0) {
    return { error: 'Entity not found' };
  }

  const entity = entities[0];
  const { symbol, filename, type, language, source, start_line, end_line } = entity;

  if (!source) {
    return { error: 'No source code available' };
  }

  const lineCount = (end_line || start_line) - start_line + 1;
  const functionLength = analyzeFunctionLength(lineCount);
  const readability = calculateReadabilityScore(source, language);

  const combinedScore = Math.round(
    readability.score * (1 - READABILITY_WEIGHTS.function_length) +
    functionLength.score * READABILITY_WEIGHTS.function_length
  );

  return {
    symbol,
    filename,
    line: start_line,
    type,
    language,
    score: combinedScore,
    rating: readability.rating,
    function_length: functionLength,
    breakdown: readability.breakdown
  };
};

export {
  calculateReadabilityScore,
  analyze_project_readability,
  analyze_function_readability,
  analyzeIdentifierLengths,
  analyzeCommentRatio,
  analyzeFunctionLength,
  analyzeNestingDepth,
  analyzeLineLengths,
  detectMagicNumbers,
  analyzeBooleanComplexity,
  READABILITY_WEIGHTS,
  THRESHOLDS
};
