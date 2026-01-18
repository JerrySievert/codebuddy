'use strict';

/**
 * @fileoverview Static code analysis module.
 * Provides various code analysis capabilities including dead code detection,
 * code duplication, dependency analysis, security vulnerability detection,
 * code smells, type analysis, API surface analysis, documentation coverage,
 * and variable scope analysis.
 * @module lib/analysis
 */

import { query } from './db.mjs';
import {
  calculate_complexity,
  calculate_aggregate_complexity
} from './complexity.mjs';
import {
  get_symbol_references,
  get_definition_for_symbol,
  get_all_definitions,
  get_reference_summary
} from './model/symbol_reference.mjs';
import {
  get_parents,
  get_children,
  get_children_by_symbol,
  get_project_hierarchy,
  get_inheritance_stats
} from './model/inheritance.mjs';
import { get_class_entities } from './model/entity.mjs';
import { analyze_project_concurrency } from './concurrency.mjs';
import { analyze_project_resources } from './resources.mjs';
import { analyze_project_naming } from './naming.mjs';
import { analyze_project_readability } from './readability.mjs';
import { analyze_project_patterns } from './patterns.mjs';
import { analyze_project_tests } from './testing.mjs';

// ============================================================================
// DEAD CODE DETECTION
// ============================================================================

/**
 * Detect dead code (unreferenced functions) in a project.
 * A function is considered dead if it has no callers and is not an entry point.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Dead code analysis results
 */
const detect_dead_code = async (project_id) => {
  // Find functions that are never called (no incoming relationships)
  const uncalled_functions = await query`
    SELECT e.id, e.symbol, e.filename, e.start_line, e.end_line, e.parameters,
           e.return_type, e.language,
           (e.end_line - e.start_line + 1) as lines
    FROM entity e
    WHERE e.project_id = ${project_id}
      AND e.type = 'function'
      AND e.id NOT IN (
        SELECT DISTINCT r.callee FROM relationship r
        JOIN entity caller ON r.caller = caller.id
        WHERE caller.project_id = ${project_id}
      )
    ORDER BY (e.end_line - e.start_line + 1) DESC
  `;

  // Common entry point patterns that are likely not dead code
  const entry_point_patterns = [
    /^main$/i,
    /^init/i,
    /^setup/i,
    /^configure/i,
    /^bootstrap/i,
    /^handle/i,
    /^on[A-Z]/,
    /^test/i,
    /^spec/i,
    /^describe$/i,
    /^it$/i,
    /^before/i,
    /^after/i,
    /^export/i,
    /^render$/i,
    /^constructor$/i,
    /^__init__$/,
    /^__main__$/,
    /^app$/i,
    /^server$/i,
    /^handler$/i,
    /^middleware$/i,
    /^route/i,
    /^api/i,
    /^get[A-Z]/,
    /^set[A-Z]/,
    /^is[A-Z]/,
    /^has[A-Z]/
  ];

  const is_likely_entry_point = (symbol) => {
    return entry_point_patterns.some((pattern) => pattern.test(symbol));
  };

  const dead_functions = [];
  const potential_entry_points = [];

  for (const fn of uncalled_functions) {
    if (is_likely_entry_point(fn.symbol)) {
      potential_entry_points.push({
        ...fn,
        reason: 'May be an entry point, event handler, or exported function'
      });
    } else {
      dead_functions.push(fn);
    }
  }

  // Calculate total dead lines of code
  const total_dead_lines = dead_functions.reduce(
    (sum, fn) => sum + fn.lines,
    0
  );

  // Get total project stats for comparison
  const total_stats = await query`
    SELECT COUNT(*) as total_functions,
           SUM(end_line - start_line + 1) as total_lines
    FROM entity
    WHERE project_id = ${project_id} AND type = 'function'
  `;

  return {
    dead_functions: dead_functions,
    potential_entry_points: potential_entry_points,
    summary: {
      dead_function_count: dead_functions.length,
      potential_entry_point_count: potential_entry_points.length,
      dead_lines_of_code: total_dead_lines,
      total_functions: parseInt(total_stats[0]?.total_functions || 0),
      total_lines: parseInt(total_stats[0]?.total_lines || 0),
      dead_code_percentage:
        total_stats[0]?.total_lines > 0
          ? Math.round(
              (total_dead_lines / total_stats[0].total_lines) * 100 * 10
            ) / 10
          : 0
    }
  };
};

// ============================================================================
// CODE DUPLICATION DETECTION
// ============================================================================

/**
 * Normalize source code for comparison by removing whitespace and comments.
 * @param {string} source - The source code to normalize
 * @returns {string} Normalized source code
 */
const normalize_source = (source) => {
  if (!source) return '';
  return source
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/#.*$/gm, '') // Remove Python comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .toLowerCase();
};

/**
 * Calculate similarity between two strings using Jaccard similarity on tokens.
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score between 0 and 1
 */
const calculate_similarity = (a, b) => {
  const tokens_a = new Set(a.split(/\s+/).filter((t) => t.length > 2));
  const tokens_b = new Set(b.split(/\s+/).filter((t) => t.length > 2));

  if (tokens_a.size === 0 && tokens_b.size === 0) return 1;
  if (tokens_a.size === 0 || tokens_b.size === 0) return 0;

  const intersection = new Set([...tokens_a].filter((x) => tokens_b.has(x)));
  const union = new Set([...tokens_a, ...tokens_b]);

  return intersection.size / union.size;
};

/**
 * Detect code duplication in a project.
 * Finds functions with similar source code.
 * @param {number} project_id - The project ID to analyze
 * @param {number} [similarity_threshold=0.7] - Minimum similarity to consider as duplicate
 * @returns {Promise<Object>} Duplication analysis results
 */
const detect_code_duplication = async (
  project_id,
  similarity_threshold = 0.7
) => {
  const functions = await query`
    SELECT id, symbol, filename, start_line, end_line, source, language,
           (end_line - start_line + 1) as lines
    FROM entity
    WHERE project_id = ${project_id}
      AND type = 'function'
      AND source IS NOT NULL
      AND (end_line - start_line + 1) >= 5
    ORDER BY symbol
  `;

  const duplicates = [];
  const processed = new Set();

  // Normalize all sources first
  const normalized_functions = functions.map((fn) => ({
    ...fn,
    normalized_source: normalize_source(fn.source)
  }));

  // Compare each function with others
  for (let i = 0; i < normalized_functions.length; i++) {
    const fn_a = normalized_functions[i];
    if (processed.has(fn_a.id)) continue;

    const clones = [];

    for (let j = i + 1; j < normalized_functions.length; j++) {
      const fn_b = normalized_functions[j];
      if (processed.has(fn_b.id)) continue;

      // Skip if they're the same function
      if (fn_a.id === fn_b.id) continue;

      // Quick length check - if lengths differ by more than 50%, skip
      if (
        Math.abs(fn_a.lines - fn_b.lines) / Math.max(fn_a.lines, fn_b.lines) >
        0.5
      ) {
        continue;
      }

      const similarity = calculate_similarity(
        fn_a.normalized_source,
        fn_b.normalized_source
      );

      if (similarity >= similarity_threshold) {
        clones.push({
          id: fn_b.id,
          symbol: fn_b.symbol,
          filename: fn_b.filename,
          start_line: fn_b.start_line,
          end_line: fn_b.end_line,
          lines: fn_b.lines,
          similarity: Math.round(similarity * 100)
        });
        processed.add(fn_b.id);
      }
    }

    if (clones.length > 0) {
      processed.add(fn_a.id);
      duplicates.push({
        original: {
          id: fn_a.id,
          symbol: fn_a.symbol,
          filename: fn_a.filename,
          start_line: fn_a.start_line,
          end_line: fn_a.end_line,
          lines: fn_a.lines
        },
        clones,
        total_duplicated_lines: clones.reduce((sum, c) => sum + c.lines, 0)
      });
    }
  }

  // Calculate summary statistics
  const total_duplicated_lines = duplicates.reduce(
    (sum, d) => sum + d.total_duplicated_lines,
    0
  );

  const total_stats = await query`
    SELECT SUM(end_line - start_line + 1) as total_lines
    FROM entity
    WHERE project_id = ${project_id} AND type = 'function'
  `;

  return {
    duplicate_groups: duplicates,
    summary: {
      duplicate_group_count: duplicates.length,
      total_clone_count: duplicates.reduce(
        (sum, d) => sum + d.clones.length,
        0
      ),
      duplicated_lines: total_duplicated_lines,
      total_lines: parseInt(total_stats[0]?.total_lines || 0),
      duplication_percentage:
        total_stats[0]?.total_lines > 0
          ? Math.round(
              (total_duplicated_lines / total_stats[0].total_lines) * 100 * 10
            ) / 10
          : 0
    }
  };
};

// ============================================================================
// DEPENDENCY ANALYSIS
// ============================================================================

/**
 * Analyze file-level dependencies based on function call relationships.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Dependency analysis results
 */
const analyze_dependencies = async (project_id) => {
  // Get file-to-file dependencies based on function calls
  const file_dependencies = await query`
    SELECT
      caller_e.filename as source_file,
      callee_e.filename as target_file,
      COUNT(*) as call_count,
      array_agg(DISTINCT caller_e.symbol || ' -> ' || callee_e.symbol) as calls
    FROM relationship r
    JOIN entity caller_e ON r.caller = caller_e.id
    JOIN entity callee_e ON r.callee = callee_e.id
    WHERE caller_e.project_id = ${project_id}
      AND callee_e.project_id = ${project_id}
      AND caller_e.filename != callee_e.filename
    GROUP BY caller_e.filename, callee_e.filename
    ORDER BY call_count DESC
  `;

  // Build dependency graph
  const files = new Map();
  const edges = [];

  for (const dep of file_dependencies) {
    if (!files.has(dep.source_file)) {
      files.set(dep.source_file, { imports: 0, exports: 0 });
    }
    if (!files.has(dep.target_file)) {
      files.set(dep.target_file, { imports: 0, exports: 0 });
    }

    files.get(dep.source_file).imports++;
    files.get(dep.target_file).exports++;

    edges.push({
      source: dep.source_file,
      target: dep.target_file,
      weight: dep.call_count,
      calls: dep.calls.slice(0, 5) // Limit to first 5 examples
    });
  }

  // Detect circular dependencies
  const circular_dependencies = [];
  const adjacency = new Map();

  for (const dep of file_dependencies) {
    if (!adjacency.has(dep.source_file)) {
      adjacency.set(dep.source_file, new Set());
    }
    adjacency.get(dep.source_file).add(dep.target_file);
  }

  // Find bidirectional dependencies (A depends on B and B depends on A)
  for (const [source, targets] of adjacency) {
    for (const target of targets) {
      if (adjacency.has(target) && adjacency.get(target).has(source)) {
        // Only add once (check if we haven't added the reverse)
        const existing = circular_dependencies.find(
          (c) => c.file_a === target && c.file_b === source
        );
        if (!existing) {
          circular_dependencies.push({
            file_a: source,
            file_b: target
          });
        }
      }
    }
  }

  // Calculate coupling metrics
  const file_stats = Array.from(files.entries()).map(([filename, stats]) => ({
    filename,
    afferent_coupling: stats.exports, // Incoming dependencies (others depend on this)
    efferent_coupling: stats.imports, // Outgoing dependencies (this depends on others)
    instability:
      stats.imports + stats.exports > 0
        ? Math.round((stats.imports / (stats.imports + stats.exports)) * 100) /
          100
        : 0
  }));

  // Sort by total coupling
  file_stats.sort(
    (a, b) =>
      b.afferent_coupling +
      b.efferent_coupling -
      (a.afferent_coupling + a.efferent_coupling)
  );

  return {
    file_dependencies: edges,
    file_metrics: file_stats,
    circular_dependencies: circular_dependencies,
    summary: {
      total_files: files.size,
      total_dependencies: edges.length,
      circular_dependency_count: circular_dependencies.length,
      avg_dependencies_per_file:
        files.size > 0 ? Math.round((edges.length / files.size) * 10) / 10 : 0
    }
  };
};

// ============================================================================
// SECURITY VULNERABILITY DETECTION
// ============================================================================

/**
 * Security vulnerability patterns to detect.
 */
const SECURITY_PATTERNS = [
  {
    id: 'sql_injection',
    name: 'Potential SQL Injection',
    severity: 'high',
    patterns: [
      /query\s*\(\s*['"`].*\+/i,
      /execute\s*\(\s*['"`].*\+/i,
      /sql\s*=\s*['"`].*\+/i,
      /\.raw\s*\(\s*['"`].*\+/i,
      /cursor\.execute\s*\(\s*f['"`]/i
    ],
    description:
      'String concatenation in SQL queries can lead to SQL injection attacks'
  },
  {
    id: 'command_injection',
    name: 'Potential Command Injection',
    severity: 'high',
    patterns: [
      /exec\s*\(\s*['"`].*\+/i,
      /system\s*\(\s*['"`].*\+/i,
      /popen\s*\(\s*['"`].*\+/i,
      /child_process\.exec\s*\(/i,
      /subprocess\.call\s*\(\s*['"`].*\+/i,
      /os\.system\s*\(/i,
      /eval\s*\(/i
    ],
    description:
      'Executing shell commands with user input can lead to command injection'
  },
  {
    id: 'hardcoded_secret',
    name: 'Hardcoded Secret/Credential',
    severity: 'high',
    patterns: [
      /password\s*=\s*['"][^'"]{4,}['"]/i,
      /api_key\s*=\s*['"][^'"]{8,}['"]/i,
      /secret\s*=\s*['"][^'"]{8,}['"]/i,
      /token\s*=\s*['"][^'"]{8,}['"]/i,
      /private_key\s*=\s*['"][^'"]+['"]/i,
      /AWS_SECRET/i,
      /PRIVATE_KEY/
    ],
    description:
      'Hardcoded credentials should be stored securely in environment variables'
  },
  {
    id: 'path_traversal',
    name: 'Potential Path Traversal',
    severity: 'medium',
    patterns: [
      /\.\.\/|\.\.\\/, // Basic path traversal
      /readFile\s*\(\s*[^'"`]+\+/i,
      /open\s*\(\s*[^'"`]+\+/i,
      /fopen\s*\(\s*[^'"`]+\+/i
    ],
    description:
      'File operations with user input can lead to unauthorized file access'
  },
  {
    id: 'xss',
    name: 'Potential Cross-Site Scripting (XSS)',
    severity: 'medium',
    patterns: [
      /innerHTML\s*=/i,
      /document\.write\s*\(/i,
      /\.html\s*\(\s*[^)]*\+/i,
      /dangerouslySetInnerHTML/i
    ],
    description:
      'Inserting unescaped user input into HTML can lead to XSS attacks'
  },
  {
    id: 'insecure_random',
    name: 'Insecure Random Number Generation',
    severity: 'low',
    patterns: [/Math\.random\s*\(/, /random\.random\s*\(/, /rand\s*\(\s*\)/],
    description:
      'Math.random() is not cryptographically secure. Use crypto.randomBytes() for security-sensitive operations'
  },
  {
    id: 'debug_code',
    name: 'Debug Code in Production',
    severity: 'low',
    patterns: [
      /console\.log\s*\(/,
      /console\.debug\s*\(/,
      /print\s*\(\s*f?['"]debug/i,
      /debugger;/
    ],
    description:
      'Debug statements should be removed before production deployment'
  },
  {
    id: 'unsafe_regex',
    name: 'Potentially Unsafe Regular Expression',
    severity: 'medium',
    patterns: [/\(\.\*\)\+/, /\(\.\+\)\+/, /\([^)]*\|[^)]*\)\+/],
    description:
      'Complex regex patterns can cause ReDoS (Regular Expression Denial of Service)'
  }
];

/**
 * Detect security vulnerabilities in project source code.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Security analysis results
 */
const detect_security_vulnerabilities = async (project_id) => {
  const functions = await query`
    SELECT id, symbol, filename, start_line, end_line, source, language
    FROM entity
    WHERE project_id = ${project_id}
      AND type = 'function'
      AND source IS NOT NULL
    ORDER BY filename, start_line
  `;

  const vulnerabilities = [];
  const severity_counts = { high: 0, medium: 0, low: 0 };

  for (const fn of functions) {
    for (const pattern of SECURITY_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(fn.source)) {
          vulnerabilities.push({
            function_id: fn.id,
            symbol: fn.symbol,
            filename: fn.filename,
            start_line: fn.start_line,
            vulnerability_type: pattern.id,
            vulnerability_name: pattern.name,
            severity: pattern.severity,
            description: pattern.description
          });
          severity_counts[pattern.severity]++;
          break; // Only report each pattern type once per function
        }
      }
    }
  }

  // Group by file
  const by_file = {};
  for (const vuln of vulnerabilities) {
    if (!by_file[vuln.filename]) {
      by_file[vuln.filename] = [];
    }
    by_file[vuln.filename].push(vuln);
  }

  return {
    vulnerabilities,
    by_file: by_file,
    summary: {
      total_vulnerabilities: vulnerabilities.length,
      high_severity: severity_counts.high,
      medium_severity: severity_counts.medium,
      low_severity: severity_counts.low,
      files_affected: Object.keys(by_file).length,
      functions_analyzed: functions.length
    }
  };
};

// ============================================================================
// CODE METRICS DASHBOARD
// ============================================================================

/**
 * Get comprehensive code metrics for a project.
 * Combines complexity metrics with additional analysis.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Code metrics dashboard data
 */
const get_code_metrics = async (project_id) => {
  const functions = await query`
    SELECT id, symbol, filename, start_line, end_line, source, parameters, language,
           (end_line - start_line + 1) as lines
    FROM entity
    WHERE project_id = ${project_id}
      AND type = 'function'
    ORDER BY filename, start_line
  `;

  // Calculate individual function complexities
  const function_metrics = functions.map((fn) => {
    const complexity = calculate_complexity(fn);
    return {
      id: fn.id,
      symbol: fn.symbol,
      filename: fn.filename,
      start_line: fn.start_line,
      lines: fn.lines,
      ...complexity
    };
  });

  // Sort by cyclomatic complexity for "most complex" list
  const most_complex = [...function_metrics]
    .sort((a, b) => b.cyclomatic - a.cyclomatic)
    .slice(0, 20);

  // Sort by lines of code for "largest functions" list
  const largest_functions = [...function_metrics]
    .sort((a, b) => b.loc - a.loc)
    .slice(0, 20);

  // Calculate aggregate metrics
  const aggregate = calculate_aggregate_complexity(functions);

  // Calculate metrics by file
  const by_file = {};
  for (const fn of function_metrics) {
    if (!by_file[fn.filename]) {
      by_file[fn.filename] = {
        filename: fn.filename,
        function_count: 0,
        total_loc: 0,
        total_cyclomatic: 0,
        max_cyclomatic: 0,
        max_nesting: 0
      };
    }
    by_file[fn.filename].function_count++;
    by_file[fn.filename].total_loc += fn.loc;
    by_file[fn.filename].total_cyclomatic += fn.cyclomatic;
    by_file[fn.filename].max_cyclomatic = Math.max(
      by_file[fn.filename].max_cyclomatic,
      fn.cyclomatic
    );
    by_file[fn.filename].max_nesting = Math.max(
      by_file[fn.filename].max_nesting,
      fn.nesting_depth
    );
  }

  const file_metrics = Object.values(by_file).map((file) => ({
    ...file,
    avg_cyclomatic:
      Math.round((file.total_cyclomatic / file.function_count) * 10) / 10
  }));

  // Sort files by total complexity
  file_metrics.sort((a, b) => b.total_cyclomatic - a.total_cyclomatic);

  // Calculate maintainability index (simplified version)
  // MI = 171 - 5.2 * ln(avgV) - 0.23 * avgCC - 16.2 * ln(avgLOC)
  // Using a simplified version based on cyclomatic complexity and LOC
  const avg_loc = aggregate.avg_loc || 1;
  const avg_cc = aggregate.avg_cyclomatic || 1;
  const maintainability_index = Math.max(
    0,
    Math.min(
      100,
      171 -
        5.2 * Math.log(avg_loc * avg_cc) -
        0.23 * avg_cc -
        16.2 * Math.log(avg_loc)
    )
  );

  return {
    aggregate,
    most_complex: most_complex,
    largest_functions: largest_functions,
    file_metrics: file_metrics,
    function_count: function_metrics.length,
    maintainability_index: Math.round(maintainability_index),
    maintainability_rating:
      maintainability_index >= 80
        ? 'High'
        : maintainability_index >= 60
          ? 'Medium'
          : maintainability_index >= 40
            ? 'Low'
            : 'Very Low'
  };
};

// ============================================================================
// CODE SMELL DETECTION
// ============================================================================

/**
 * Code smell thresholds for detection.
 */
const CODE_SMELL_THRESHOLDS = {
  longMethod: 50, // Lines of code
  longParameterList: 5, // Number of parameters
  highComplexity: 15, // Cyclomatic complexity
  deepNesting: 4, // Nesting depth
  godFunction: 200 // LOC for "god function"
};

/**
 * Detect code smells in a project.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Code smell analysis results
 */
const detect_code_smells = async (project_id) => {
  const functions = await query`
    SELECT id, symbol, filename, start_line, end_line, source, parameters, language,
           (end_line - start_line + 1) as lines
    FROM entity
    WHERE project_id = ${project_id}
      AND type = 'function'
    ORDER BY filename, start_line
  `;

  const smells = {
    long_methods: [],
    long_parameter_lists: [],
    high_complexity: [],
    deep_nesting: [],
    god_functions: [],
    duplicate_code_suspects: []
  };

  // Track function name frequencies for potential duplication
  const name_frequency = new Map();

  for (const fn of functions) {
    const complexity = calculate_complexity(fn);
    const lines = fn.end_line - fn.start_line + 1;

    // Track name frequency
    const base_name = fn.symbol.replace(/[0-9]+$/, ''); // Remove trailing numbers
    name_frequency.set(base_name, (name_frequency.get(base_name) || 0) + 1);

    // Long method detection
    if (lines > CODE_SMELL_THRESHOLDS.longMethod) {
      smells.long_methods.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        lines,
        threshold: CODE_SMELL_THRESHOLDS.longMethod,
        severity: lines > CODE_SMELL_THRESHOLDS.godFunction ? 'high' : 'medium'
      });
    }

    // God function detection (very long methods)
    if (lines > CODE_SMELL_THRESHOLDS.godFunction) {
      smells.god_functions.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        lines,
        threshold: CODE_SMELL_THRESHOLDS.godFunction,
        severity: 'high'
      });
    }

    // Long parameter list detection
    if (complexity.parameter_count > CODE_SMELL_THRESHOLDS.longParameterList) {
      smells.long_parameter_lists.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        parameter_count: complexity.parameter_count,
        parameters: fn.parameters,
        threshold: CODE_SMELL_THRESHOLDS.longParameterList,
        severity: complexity.parameter_count > 8 ? 'high' : 'medium'
      });
    }

    // High complexity detection
    if (complexity.cyclomatic > CODE_SMELL_THRESHOLDS.highComplexity) {
      smells.high_complexity.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        cyclomatic: complexity.cyclomatic,
        threshold: CODE_SMELL_THRESHOLDS.highComplexity,
        severity: complexity.cyclomatic > 25 ? 'high' : 'medium'
      });
    }

    // Deep nesting detection
    if (complexity.nesting_depth > CODE_SMELL_THRESHOLDS.deepNesting) {
      smells.deep_nesting.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        nesting_depth: complexity.nesting_depth,
        threshold: CODE_SMELL_THRESHOLDS.deepNesting,
        severity: complexity.nesting_depth > 6 ? 'high' : 'medium'
      });
    }
  }

  // Find functions with suspiciously similar names (potential copy-paste)
  for (const [name, count] of name_frequency) {
    if (count > 2 && name.length > 3) {
      smells.duplicate_code_suspects.push({
        base_name: name,
        occurrence_count: count,
        severity: count > 5 ? 'medium' : 'low'
      });
    }
  }

  // Calculate summary
  const total_smells =
    smells.long_methods.length +
    smells.long_parameter_lists.length +
    smells.high_complexity.length +
    smells.deep_nesting.length +
    smells.god_functions.length;

  return {
    smells,
    summary: {
      total_smells: total_smells,
      long_methods: smells.long_methods.length,
      long_parameter_lists: smells.long_parameter_lists.length,
      high_complexity: smells.high_complexity.length,
      deep_nesting: smells.deep_nesting.length,
      god_functions: smells.god_functions.length,
      duplicate_suspects: smells.duplicate_code_suspects.length,
      functions_analyzed: functions.length,
      smell_density:
        functions.length > 0
          ? Math.round((total_smells / functions.length) * 100 * 10) / 10
          : 0
    }
  };
};

// ============================================================================
// TYPE ANALYSIS (for dynamically-typed languages)
// ============================================================================

/**
 * Analyze type usage in dynamically-typed code.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Type analysis results
 */
const analyze_types = async (project_id) => {
  const functions = await query`
    SELECT id, symbol, filename, start_line, end_line, source, parameters,
           return_type, language
    FROM entity
    WHERE project_id = ${project_id}
      AND type = 'function'
    ORDER BY filename, start_line
  `;

  // Focus on dynamically-typed languages
  const dynamic_languages = ['javascript', 'python', 'ruby', 'php'];

  const type_analysis = {
    functions_without_type_hints: [],
    functions_with_type_hints: [],
    inferred_types: [],
    type_inconsistencies: []
  };

  // Type patterns for inference
  const type_patterns = {
    string: [/['"`]/, /\.toString\(/, /\.join\(/, /\.split\(/],
    number: [/\d+/, /Math\./, /\.toFixed\(/, /parseInt/, /parseFloat/],
    boolean: [/true|false/i, /!(?!=)/, /&&/, /\|\|/],
    array: [/\[.*\]/, /\.push\(/, /\.map\(/, /\.filter\(/, /\.reduce\(/],
    object: [/\{.*:.*\}/, /new\s+\w+\(/],
    promise: [/async/, /await/, /\.then\(/, /Promise\./],
    null: [/null/, /undefined/, /None/]
  };

  for (const fn of functions) {
    if (!dynamic_languages.includes(fn.language)) continue;

    const has_type_hints =
      (fn.language === 'python' && fn.source && /->\s*\w+/.test(fn.source)) ||
      (fn.language === 'javascript' &&
        fn.return_type &&
        fn.return_type !== 'function');

    if (has_type_hints) {
      type_analysis.functions_with_type_hints.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        return_type: fn.return_type,
        language: fn.language
      });
    } else {
      // Try to infer return type from source
      let inferred_type = 'unknown';
      if (fn.source) {
        // Look for return statements
        const return_match = fn.source.match(/return\s+([^;}\n]+)/);
        if (return_match) {
          const return_expr = return_match[1];
          for (const [type, patterns] of Object.entries(type_patterns)) {
            if (patterns.some((p) => p.test(return_expr))) {
              inferred_type = type;
              break;
            }
          }
        }
      }

      type_analysis.functions_without_type_hints.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        language: fn.language,
        inferred_return_type: inferred_type
      });

      if (inferred_type !== 'unknown') {
        type_analysis.inferred_types.push({
          id: fn.id,
          symbol: fn.symbol,
          filename: fn.filename,
          inferred_type: inferred_type
        });
      }
    }
  }

  const dynamic_functions = functions.filter((f) =>
    dynamic_languages.includes(f.language)
  );
  const type_coverage =
    dynamic_functions.length > 0
      ? Math.round(
          (type_analysis.functions_with_type_hints.length /
            dynamic_functions.length) *
            100
        )
      : 100;

  return {
    ...type_analysis,
    summary: {
      total_dynamic_functions: dynamic_functions.length,
      with_type_hints: type_analysis.functions_with_type_hints.length,
      without_type_hints: type_analysis.functions_without_type_hints.length,
      inferred_types: type_analysis.inferred_types.length,
      type_coverage_percentage: type_coverage
    }
  };
};

// ============================================================================
// API SURFACE ANALYSIS
// ============================================================================

/**
 * Analyze the public API surface of a project.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} API surface analysis results
 */
const analyze_api_surface = async (project_id) => {
  const functions = await query`
    SELECT e.id, e.symbol, e.filename, e.start_line, e.end_line,
           e.parameters, e.return_type, e.comment, e.language, e.source,
           (SELECT COUNT(*) FROM relationship r WHERE r.callee = e.id) as caller_count
    FROM entity e
    WHERE e.project_id = ${project_id}
      AND e.type = 'function'
    ORDER BY e.filename, e.start_line
  `;

  // Patterns that indicate public/exported functions
  const public_patterns = [
    /^export\s+/m,
    /^module\.exports/m,
    /^exports\./m,
    /^public\s+/m,
    /^def\s+[^_]/m, // Python: non-underscore-prefixed
    /^func\s+[A-Z]/m // Go: capitalized functions are exported
  ];

  const private_patterns = [
    /^_/, // Leading underscore
    /^__/, // Double underscore (Python)
    /^private\s+/m,
    /^#/ // JavaScript private fields
  ];

  const public_functions = [];
  const private_functions = [];
  const entry_points = [];

  for (const fn of functions) {
    const is_private =
      private_patterns.some((p) => p.test(fn.symbol)) ||
      (fn.source && private_patterns.some((p) => p.test(fn.source)));

    const is_public =
      !is_private &&
      (public_patterns.some((p) => fn.source && p.test(fn.source)) ||
        fn.caller_count > 0);

    const fn_data = {
      id: fn.id,
      symbol: fn.symbol,
      filename: fn.filename,
      start_line: fn.start_line,
      parameters: fn.parameters,
      return_type: fn.return_type,
      has_documentation: !!fn.comment,
      caller_count: parseInt(fn.caller_count)
    };

    if (is_private) {
      private_functions.push(fn_data);
    } else {
      public_functions.push(fn_data);

      // Entry points are public functions with many callers or specific names
      if (
        fn.caller_count >= 3 ||
        /^(main|init|setup|start|run|handler|app)$/i.test(fn.symbol)
      ) {
        entry_points.push(fn_data);
      }
    }
  }

  // Undocumented public functions
  const undocumented_public = public_functions.filter(
    (f) => !f.has_documentation
  );

  // Calculate API complexity (average parameter count for public functions)
  const avg_params =
    public_functions.length > 0
      ? public_functions.reduce((sum, f) => {
          const param_count = f.parameters ? f.parameters.split(',').length : 0;
          return sum + param_count;
        }, 0) / public_functions.length
      : 0;

  return {
    public_functions: public_functions,
    private_functions: private_functions,
    entry_points: entry_points,
    undocumented_public: undocumented_public,
    summary: {
      total_functions: functions.length,
      public_count: public_functions.length,
      private_count: private_functions.length,
      entry_point_count: entry_points.length,
      undocumented_public_count: undocumented_public.length,
      public_ratio:
        functions.length > 0
          ? Math.round((public_functions.length / functions.length) * 100)
          : 0,
      documentation_coverage:
        public_functions.length > 0
          ? Math.round(
              ((public_functions.length - undocumented_public.length) /
                public_functions.length) *
                100
            )
          : 100,
      avg_api_complexity: Math.round(avg_params * 10) / 10
    }
  };
};

// ============================================================================
// DOCUMENTATION COVERAGE
// ============================================================================

/**
 * Analyze documentation coverage in a project.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Documentation coverage analysis results
 */
const analyze_documentation = async (project_id) => {
  const functions = await query`
    SELECT id, symbol, filename, start_line, end_line, parameters,
           return_type, comment, language, source
    FROM entity
    WHERE project_id = ${project_id}
      AND type = 'function'
    ORDER BY filename, start_line
  `;

  const documented = [];
  const undocumented = [];
  const partially_documented = [];

  for (const fn of functions) {
    const has_comment = !!fn.comment && fn.comment.trim().length > 10;

    // Check for parameter documentation
    const param_count = fn.parameters
      ? fn.parameters.split(',').filter((p) => p.trim()).length
      : 0;
    const has_param_docs =
      fn.comment &&
      (/@param/.test(fn.comment) ||
        /:param/.test(fn.comment) ||
        /Args:/.test(fn.comment) ||
        /Parameters:/.test(fn.comment));

    // Check for return documentation
    const has_return_docs =
      fn.comment &&
      (/@returns?/.test(fn.comment) ||
        /:returns?:/.test(fn.comment) ||
        /Returns:/.test(fn.comment));

    const fn_data = {
      id: fn.id,
      symbol: fn.symbol,
      filename: fn.filename,
      start_line: fn.start_line,
      has_comment: has_comment,
      has_param_docs: has_param_docs,
      has_return_docs: has_return_docs,
      parameter_count: param_count,
      return_type: fn.return_type
    };

    if (!has_comment) {
      undocumented.push(fn_data);
    } else if (param_count > 0 && !has_param_docs) {
      partially_documented.push({
        ...fn_data,
        missing: 'parameter documentation'
      });
    } else if (
      fn.return_type &&
      fn.return_type !== 'void' &&
      !has_return_docs
    ) {
      partially_documented.push({
        ...fn_data,
        missing: 'return value documentation'
      });
    } else {
      documented.push(fn_data);
    }
  }

  // Group by file
  const by_file = {};
  for (const fn of functions) {
    if (!by_file[fn.filename]) {
      by_file[fn.filename] = { total: 0, documented: 0 };
    }
    by_file[fn.filename].total++;
    if (fn.comment && fn.comment.trim().length > 10) {
      by_file[fn.filename].documented++;
    }
  }

  const file_stats = Object.entries(by_file).map(([filename, stats]) => ({
    filename,
    ...stats,
    coverage:
      stats.total > 0 ? Math.round((stats.documented / stats.total) * 100) : 100
  }));

  file_stats.sort((a, b) => a.coverage - b.coverage);

  return {
    documented,
    undocumented,
    partially_documented: partially_documented,
    by_file: file_stats,
    summary: {
      total_functions: functions.length,
      fully_documented: documented.length,
      undocumented: undocumented.length,
      partially_documented: partially_documented.length,
      coverage_percentage:
        functions.length > 0
          ? Math.round((documented.length / functions.length) * 100)
          : 100,
      files_with_poor_coverage: file_stats.filter((f) => f.coverage < 50).length
    }
  };
};

// ============================================================================
// VARIABLE SCOPE ANALYSIS
// ============================================================================

/**
 * Analyze variable scope patterns in source code.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Variable scope analysis results
 */
const analyze_variable_scope = async (project_id) => {
  const functions = await query`
    SELECT id, symbol, filename, start_line, end_line, source, language
    FROM entity
    WHERE project_id = ${project_id}
      AND type = 'function'
      AND source IS NOT NULL
    ORDER BY filename, start_line
  `;

  const scope_issues = {
    global_variables: [],
    variable_shadowing: [],
    mutable_closures: [],
    unused_variables: []
  };

  // Patterns for detecting scope issues
  const global_patterns = {
    javascript: [/\bwindow\./, /\bglobal\./, /\bvar\s+\w+\s*=/],
    python: [/\bglobal\s+\w+/, /\bGLOBAL/],
    c: [/^[a-zA-Z_]\w*\s*=[^=]/m] // Very simplistic
  };

  const let_const_patterns = /\b(let|const)\s+(\w+)/g;
  const var_patterns = /\bvar\s+(\w+)/g;

  for (const fn of functions) {
    const source = fn.source;
    const language = fn.language;

    // Check for global variable usage
    const lang_patterns = global_patterns[language] || [];
    for (const pattern of lang_patterns) {
      if (pattern.test(source)) {
        scope_issues.global_variables.push({
          id: fn.id,
          symbol: fn.symbol,
          filename: fn.filename,
          start_line: fn.start_line,
          language,
          severity: 'medium'
        });
        break;
      }
    }

    // Check for variable shadowing (same name declared multiple times)
    if (language === 'javascript' || language === 'typescript') {
      const declared_vars = new Map();
      let match;

      // Reset lastIndex for global patterns
      let_const_patterns.lastIndex = 0;
      var_patterns.lastIndex = 0;

      while ((match = let_const_patterns.exec(source)) !== null) {
        const var_name = match[2];
        if (declared_vars.has(var_name)) {
          scope_issues.variable_shadowing.push({
            id: fn.id,
            symbol: fn.symbol,
            filename: fn.filename,
            start_line: fn.start_line,
            variable: var_name,
            severity: 'low'
          });
        }
        declared_vars.set(var_name, true);
      }

      while ((match = var_patterns.exec(source)) !== null) {
        const var_name = match[1];
        if (declared_vars.has(var_name)) {
          scope_issues.variable_shadowing.push({
            id: fn.id,
            symbol: fn.symbol,
            filename: fn.filename,
            start_line: fn.start_line,
            variable: var_name,
            severity: 'low'
          });
        }
        declared_vars.set(var_name, true);
      }
    }

    // Check for mutable closures (let variables used in callbacks)
    if (
      (language === 'javascript' || language === 'typescript') &&
      /\blet\s+\w+/.test(source) &&
      /\.(forEach|map|filter|reduce)\s*\(/.test(source)
    ) {
      scope_issues.mutable_closures.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        severity: 'low',
        description: 'let variable may be captured by closure in loop'
      });
    }
  }

  return {
    issues: scope_issues,
    summary: {
      total_functions_analyzed: functions.length,
      global_variable_issues: scope_issues.global_variables.length,
      shadowing_issues: scope_issues.variable_shadowing.length,
      closure_issues: scope_issues.mutable_closures.length,
      total_issues:
        scope_issues.global_variables.length +
        scope_issues.variable_shadowing.length +
        scope_issues.mutable_closures.length +
        scope_issues.unused_variables.length
    }
  };
};

// ============================================================================
// COMBINED ANALYSIS DASHBOARD
// ============================================================================

/**
 * Get a lightweight analysis dashboard with basic counts.
 * This is fast because it only runs simple SQL counts, not full analyses.
 * Individual analyses are loaded on-demand when tabs are clicked.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Lightweight analysis dashboard
 */
const get_analysis_dashboard = async (project_id) => {
  // Run lightweight queries in parallel for basic counts
  const [
    function_stats,
    dead_code_count,
    file_count,
    documented_count,
    circular_deps
  ] = await Promise.all([
    // Basic function stats
    query`
      SELECT
        COUNT(*) as total_functions,
        COUNT(*) FILTER (WHERE comment IS NOT NULL AND comment != '') as documented_count
      FROM entity
      WHERE project_id = ${project_id} AND type = 'function'
    `,
    // Dead code count (functions with no callers)
    query`
      SELECT COUNT(*) as count
      FROM entity e
      WHERE e.project_id = ${project_id}
        AND e.type = 'function'
        AND e.id NOT IN (
          SELECT DISTINCT r.callee FROM relationship r
          JOIN entity caller ON r.caller = caller.id
          WHERE caller.project_id = ${project_id}
        )
    `,
    // File count
    query`
      SELECT COUNT(DISTINCT filename) as count
      FROM entity WHERE project_id = ${project_id}
    `,
    // Documented functions count
    query`
      SELECT COUNT(*) as count
      FROM entity
      WHERE project_id = ${project_id}
        AND type = 'function'
        AND comment IS NOT NULL
        AND comment != ''
    `,
    // Circular dependency check (simplified)
    query`
      SELECT COUNT(*) as count FROM (
        SELECT DISTINCT s1.filename
        FROM sourcecode s1
        JOIN sourcecode s2 ON s1.project_id = s2.project_id
        WHERE s1.project_id = ${project_id}
          AND s1.source LIKE '%import%' || REPLACE(s2.filename, '.', '') || '%'
          AND s2.source LIKE '%import%' || REPLACE(s1.filename, '.', '') || '%'
          AND s1.filename < s2.filename
        LIMIT 10
      ) circular
    `
  ]);

  const total_functions = parseInt(function_stats[0]?.total_functions || 0);
  const dead_function_count = parseInt(dead_code_count[0]?.count || 0);
  const total_files = parseInt(file_count[0]?.count || 0);
  const documented = parseInt(documented_count[0]?.count || 0);
  const circular_count = parseInt(circular_deps[0]?.count || 0);

  // Calculate simple metrics
  const dead_code_percentage =
    total_functions > 0
      ? Math.round((dead_function_count / total_functions) * 100)
      : 0;
  const doc_coverage =
    total_functions > 0 ? Math.round((documented / total_functions) * 100) : 0;

  // Simple health score based on available data
  const health_score = Math.round(
    (Math.max(0, 100 - dead_code_percentage * 2) + doc_coverage) / 2
  );

  return {
    health_score: health_score,
    health_rating:
      health_score >= 80
        ? 'Excellent'
        : health_score >= 60
          ? 'Good'
          : health_score >= 40
            ? 'Fair'
            : 'Poor',
    summaries: {
      dead_code: {
        dead_function_count: dead_function_count,
        dead_code_percentage: dead_code_percentage,
        dead_lines_of_code: 0 // Computed on-demand
      },
      duplication: {
        duplicate_group_count: 0, // Computed on-demand
        duplication_percentage: 0
      },
      dependencies: {
        total_files: total_files,
        total_dependencies: 0, // Computed on-demand
        circular_dependency_count: circular_count
      },
      security: {
        total_vulnerabilities: 0, // Computed on-demand
        high_severity: 0,
        medium_severity: 0,
        low_severity: 0
      },
      metrics: {
        total_functions: total_functions,
        maintainability_index: 70, // Default, computed on-demand
        maintainability_rating: 'Good'
      },
      code_smells: {
        total_smells: 0, // Computed on-demand
        smell_density: 0,
        god_functions: 0
      },
      types: {
        total_dynamic_functions: 0, // Computed on-demand
        with_type_hints: 0,
        type_coverage_percentage: 0
      },
      api_surface: {
        public_count: total_functions,
        private_count: 0,
        documentation_coverage: doc_coverage
      },
      documentation: {
        coverage_percentage: doc_coverage,
        fully_documented: documented,
        undocumented: total_functions - documented
      },
      scope: {
        total_issues: 0, // Computed on-demand
        global_variable_issues: 0,
        shadowing_issues: 0
      }
    }
  };
};

/**
 * Run full analyses and return a detailed dashboard.
 * This is slower but provides complete data for all tabs.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Full analysis dashboard
 */
const get_analysis_dashboard_full = async (project_id) => {
  const [
    dead_code,
    duplication,
    dependencies,
    security,
    metrics,
    code_smells,
    types,
    api_surface,
    documentation,
    scope_analysis
  ] = await Promise.all([
    detect_dead_code(project_id),
    detect_code_duplication(project_id),
    analyze_dependencies(project_id),
    detect_security_vulnerabilities(project_id),
    get_code_metrics(project_id),
    detect_code_smells(project_id),
    analyze_types(project_id),
    analyze_api_surface(project_id),
    analyze_documentation(project_id),
    analyze_variable_scope(project_id)
  ]);

  // Calculate overall health score (0-100)
  const health_factors = [
    // Security: -20 points per high severity, -10 per medium, -5 per low
    Math.max(
      0,
      100 -
        security.summary.high_severity * 20 -
        security.summary.medium_severity * 10 -
        security.summary.low_severity * 5
    ),
    // Maintainability
    metrics.maintainability_index,
    // Documentation coverage
    documentation.summary.coverage_percentage,
    // Code smell density (inverse)
    Math.max(0, 100 - code_smells.summary.smell_density * 2),
    // Dead code (inverse)
    Math.max(0, 100 - dead_code.summary.dead_code_percentage * 2),
    // Duplication (inverse)
    Math.max(0, 100 - duplication.summary.duplication_percentage * 2)
  ];

  const health_score = Math.round(
    health_factors.reduce((sum, f) => sum + f, 0) / health_factors.length
  );

  return {
    health_score: health_score,
    health_rating:
      health_score >= 80
        ? 'Excellent'
        : health_score >= 60
          ? 'Good'
          : health_score >= 40
            ? 'Fair'
            : 'Poor',
    summaries: {
      dead_code: dead_code.summary,
      duplication: duplication.summary,
      dependencies: dependencies.summary,
      security: security.summary,
      metrics: {
        total_functions: metrics.function_count,
        maintainability_index: metrics.maintainability_index,
        maintainability_rating: metrics.maintainability_rating,
        ...metrics.aggregate
      },
      code_smells: code_smells.summary,
      types: types.summary,
      api_surface: api_surface.summary,
      documentation: documentation.summary,
      scope: scope_analysis.summary
    }
  };
};

// ============================================================================
// CROSS-REFERENCE BROWSER
// ============================================================================

/**
 * Find all references to a symbol in a project.
 * Returns all occurrences of the symbol with context information.
 * @param {number} project_id - The project ID
 * @param {string} symbol - The symbol name to find references for
 * @param {Object} [options] - Optional filters
 * @param {string} [options.filename] - Filter by filename
 * @param {boolean} [options.definitions_only] - Only return definitions
 * @returns {Promise<Object>} References with summary
 */
const find_all_references = async (project_id, symbol, options = {}) => {
  const references = await get_symbol_references({
    project_id,
    symbol,
    filename: options.filename,
    is_definition: options.definitions_only ? true : undefined
  });

  // Group references by file
  const by_file = {};
  let definition_count = 0;
  let read_count = 0;
  let write_count = 0;

  for (const ref of references) {
    if (!by_file[ref.filename]) {
      by_file[ref.filename] = [];
    }
    by_file[ref.filename].push(ref);

    if (ref.is_definition) definition_count++;
    if (ref.is_write) write_count++;
    else read_count++;
  }

  // Find the primary definition (if any)
  const primary_definition = references.find(
    (r) => r.is_definition && r.definition_entity_id
  );

  return {
    symbol,
    references,
    by_file: by_file,
    primary_definition: primary_definition || null,
    summary: {
      total_references: references.length,
      file_count: Object.keys(by_file).length,
      definition_count: definition_count,
      read_count: read_count,
      write_count: write_count
    }
  };
};

/**
 * Go to the definition of a symbol.
 * Attempts to find where a symbol is defined.
 * @param {number} project_id - The project ID
 * @param {string} symbol - The symbol name
 * @param {Object} [context] - Optional context for disambiguation
 * @param {string} [context.filename] - File where the reference is
 * @param {number} [context.line] - Line where the reference is
 * @returns {Promise<Object|null>} Definition location or null if not found
 */
const go_to_definition = async (project_id, symbol, context = {}) => {
  const definition = await get_definition_for_symbol({
    project_id,
    symbol,
    filename: context.filename,
    line: context.line
  });

  if (!definition) {
    return {
      symbol,
      found: false,
      message: `No definition found for symbol '${symbol}'`
    };
  }

  // Determine the best location info
  const location = {
    filename: definition.entity_filename || definition.filename,
    line: definition.entity_start_line || definition.line,
    end_line: definition.entity_end_line || definition.line,
    column_start: definition.column_start,
    column_end: definition.column_end
  };

  return {
    symbol,
    found: true,
    definition: {
      ...location,
      symbol_type: definition.symbol_type || definition.entity_type,
      context: definition.context,
      parameters: definition.entity_parameters,
      return_type: definition.entity_return_type,
      comment: definition.entity_comment,
      entity_id: definition.entity_id || definition.definition_entity_id
    }
  };
};

/**
 * Get all symbol definitions in a project, optionally filtered by type.
 * @param {number} project_id - The project ID
 * @param {Object} [options] - Optional filters
 * @param {string} [options.symbol_type] - Filter by symbol type (function, class, variable, etc.)
 * @returns {Promise<Object>} All definitions with summary
 */
const list_definitions = async (project_id, options = {}) => {
  const definitions = await get_all_definitions({
    project_id,
    symbol_type: options.symbol_type
  });

  // Group by type
  const by_type = {};
  for (const def of definitions) {
    if (!by_type[def.symbol_type]) {
      by_type[def.symbol_type] = [];
    }
    by_type[def.symbol_type].push(def);
  }

  // Group by file
  const by_file = {};
  for (const def of definitions) {
    if (!by_file[def.filename]) {
      by_file[def.filename] = [];
    }
    by_file[def.filename].push(def);
  }

  return {
    definitions,
    by_type: by_type,
    by_file: by_file,
    summary: {
      total_definitions: definitions.length,
      type_counts: Object.fromEntries(
        Object.entries(by_type).map(([type, defs]) => [type, defs.length])
      ),
      file_count: Object.keys(by_file).length
    }
  };
};

/**
 * Get a summary of symbol references in a project.
 * Shows which symbols are most referenced.
 * @param {number} project_id - The project ID
 * @returns {Promise<Object>} Reference summary with top symbols
 */
const get_symbol_reference_summary = async (project_id) => {
  const summary = await get_reference_summary(project_id);

  // Group by symbol type
  const by_type = {};
  for (const item of summary) {
    if (!by_type[item.symbol_type]) {
      by_type[item.symbol_type] = [];
    }
    by_type[item.symbol_type].push(item);
  }

  // Calculate totals
  const total_references = summary.reduce(
    (sum, s) => sum + parseInt(s.reference_count),
    0
  );
  const total_definitions = summary.reduce(
    (sum, s) => sum + parseInt(s.definition_count),
    0
  );

  return {
    top_symbols: summary,
    by_type: by_type,
    summary: {
      unique_symbols: summary.length,
      total_references: total_references,
      total_definitions: total_definitions,
      type_counts: Object.fromEntries(
        Object.entries(by_type).map(([type, items]) => [type, items.length])
      )
    }
  };
};

/**
 * Find symbols at a specific location in a file.
 * Useful for "hover" functionality.
 * @param {number} project_id - The project ID
 * @param {string} filename - The filename
 * @param {number} line - Line number
 * @param {number} [column] - Optional column number for more precise matching
 * @returns {Promise<Object[]>} Symbols at the location
 */
const find_symbols_at_location = async (project_id, filename, line, column) => {
  let symbols;

  if (column !== undefined) {
    symbols = await query`
      SELECT
        sr.symbol,
        sr.symbol_type,
        sr.line,
        sr.column_start,
        sr.column_end,
        sr.context,
        sr.is_definition,
        sr.is_write,
        sr.definition_entity_id,
        e.filename AS definition_filename,
        e.start_line AS definition_line,
        e.parameters,
        e.return_type,
        e.comment
      FROM symbol_reference sr
      LEFT JOIN entity e ON sr.definition_entity_id = e.id
      WHERE sr.project_id = ${project_id}
        AND sr.filename = ${filename}
        AND sr.line = ${line}
        AND sr.column_start <= ${column}
        AND sr.column_end >= ${column}
      ORDER BY sr.column_start
    `;
  } else {
    symbols = await query`
      SELECT
        sr.symbol,
        sr.symbol_type,
        sr.line,
        sr.column_start,
        sr.column_end,
        sr.context,
        sr.is_definition,
        sr.is_write,
        sr.definition_entity_id,
        e.filename AS definition_filename,
        e.start_line AS definition_line,
        e.parameters,
        e.return_type,
        e.comment
      FROM symbol_reference sr
      LEFT JOIN entity e ON sr.definition_entity_id = e.id
      WHERE sr.project_id = ${project_id}
        AND sr.filename = ${filename}
        AND sr.line = ${line}
      ORDER BY sr.column_start
    `;
  }

  return symbols;
};

// ============================================================================
// CLASS HIERARCHY ANALYSIS
// ============================================================================

/**
 * Get the inheritance hierarchy tree for a class.
 * Can traverse up (parents/ancestors), down (children/descendants), or both.
 * @param {number} project_id - The project ID
 * @param {string} symbol - The class/struct symbol name
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.direction='both'] - 'up', 'down', or 'both'
 * @param {number} [options.max_depth=10] - Maximum depth to traverse
 * @returns {Promise<Object>} Hierarchy tree with ancestors and/or descendants
 */
const get_class_hierarchy = async (project_id, symbol, options = {}) => {
  const direction = options.direction || 'both';
  const max_depth = options.max_depth || 10;

  // Find the entity for this symbol
  const class_entities = await get_class_entities({ project_id });
  const target_entity = class_entities.find((e) => e.symbol === symbol);

  if (!target_entity) {
    return {
      symbol,
      found: false,
      message: `Class or struct '${symbol}' not found in project`
    };
  }

  const result = {
    symbol,
    found: true,
    entity: {
      id: target_entity.id,
      filename: target_entity.filename,
      start_line: target_entity.start_line,
      type: target_entity.type,
      is_abstract: target_entity.is_abstract,
      parent_class: target_entity.parent_class,
      interfaces: target_entity.interfaces
    },
    ancestors: [],
    descendants: []
  };

  // Build ancestors (going up)
  if (direction === 'up' || direction === 'both') {
    const build_ancestors = async (entity_id, depth) => {
      if (depth >= max_depth) return [];

      const parents = await get_parents(entity_id);
      const ancestors = [];

      for (const parent of parents) {
        const ancestor = {
          symbol: parent.parent_symbol,
          relationship_type: parent.relationship_type,
          entity_id: parent.parent_entity_id,
          filename: parent.parent_filename,
          start_line: parent.parent_start_line,
          depth: depth + 1,
          ancestors: []
        };

        // Recurse if we have a linked entity
        if (parent.parent_entity_id) {
          ancestor.ancestors = await build_ancestors(
            parent.parent_entity_id,
            depth + 1
          );
        }

        ancestors.push(ancestor);
      }

      return ancestors;
    };

    result.ancestors = await build_ancestors(target_entity.id, 0);
  }

  // Build descendants (going down)
  if (direction === 'down' || direction === 'both') {
    const build_descendants = async (entity_id, depth) => {
      if (depth >= max_depth) return [];

      const children = await get_children(entity_id);
      const descendants = [];

      for (const child of children) {
        const descendant = {
          symbol: child.child_symbol,
          relationship_type: child.relationship_type,
          entity_id: child.child_entity_id,
          filename: child.child_filename,
          start_line: child.child_start_line,
          depth: depth + 1,
          descendants: []
        };

        // Recurse
        descendant.descendants = await build_descendants(
          child.child_entity_id,
          depth + 1
        );

        descendants.push(descendant);
      }

      return descendants;
    };

    result.descendants = await build_descendants(target_entity.id, 0);
  }

  // Calculate summary
  const count_nodes = (nodes, prop) => {
    let count = nodes.length;
    for (const node of nodes) {
      if (node[prop] && node[prop].length > 0) {
        count += count_nodes(node[prop], prop);
      }
    }
    return count;
  };

  result.summary = {
    ancestor_count: count_nodes(result.ancestors, 'ancestors'),
    descendant_count: count_nodes(result.descendants, 'descendants'),
    direct_parents: result.ancestors.length,
    direct_children: result.descendants.filter((d) => d.depth === 1).length
  };

  return result;
};

/**
 * Find all classes that implement a specific interface or extend a class.
 * @param {number} project_id - The project ID
 * @param {string} interface_symbol - The interface/class symbol to find implementations of
 * @returns {Promise<Object>} List of implementing classes
 */
const find_implementations = async (project_id, interface_symbol) => {
  const implementations = await get_children_by_symbol(
    project_id,
    interface_symbol
  );

  // Group by relationship type
  const by_type = {};
  for (const impl of implementations) {
    if (!by_type[impl.relationship_type]) {
      by_type[impl.relationship_type] = [];
    }
    by_type[impl.relationship_type].push(impl);
  }

  return {
    interface_symbol,
    implementations,
    by_relationship_type: by_type,
    summary: {
      total_implementations: implementations.length,
      extends_count: (by_type['extends'] || []).length,
      implements_count: (by_type['implements'] || []).length,
      embeds_count: (by_type['embeds'] || []).length
    }
  };
};

/**
 * Analyze the complete class hierarchy of a project.
 * @param {number} project_id - The project ID
 * @returns {Promise<Object>} Full hierarchy analysis
 */
const analyze_class_hierarchy = async (project_id) => {
  // Get all inheritance relationships
  const all_relationships = await get_project_hierarchy(project_id);

  // Get stats
  const stats = await get_inheritance_stats(project_id);

  // Get all class entities
  const class_entities = await get_class_entities({ project_id });

  // Build a map of entities by ID for quick lookup
  const entity_by_id = new Map();
  for (const entity of class_entities) {
    entity_by_id.set(entity.id, entity);
  }

  // Find root classes (no parents)
  const child_ids = new Set(all_relationships.map((r) => r.child_entity_id));
  const parent_ids = new Set(
    all_relationships
      .filter((r) => r.parent_entity_id)
      .map((r) => r.parent_entity_id)
  );

  const root_classes = class_entities.filter(
    (e) => !all_relationships.some((r) => r.child_entity_id === e.id)
  );

  // Find leaf classes (no children)
  const leaf_classes = class_entities.filter(
    (e) => !all_relationships.some((r) => r.parent_entity_id === e.id)
  );

  // Find abstract classes
  const abstract_classes = class_entities.filter((e) => e.is_abstract);

  // Calculate depth for each class
  const depths = new Map();
  const calculate_depth = async (entity_id, visited = new Set()) => {
    if (visited.has(entity_id)) return 0; // Cycle detection
    if (depths.has(entity_id)) return depths.get(entity_id);

    visited.add(entity_id);
    const parents = await get_parents(entity_id);

    if (parents.length === 0) {
      depths.set(entity_id, 0);
      return 0;
    }

    let max_parent_depth = 0;
    for (const parent of parents) {
      if (parent.parent_entity_id) {
        const parent_depth = await calculate_depth(
          parent.parent_entity_id,
          visited
        );
        max_parent_depth = Math.max(max_parent_depth, parent_depth);
      }
    }

    const depth = max_parent_depth + 1;
    depths.set(entity_id, depth);
    return depth;
  };

  // Calculate depth for all classes
  for (const entity of class_entities) {
    await calculate_depth(entity.id);
  }

  // Find deepest inheritance chain
  let max_depth = 0;
  let deepest_class = null;
  for (const [entity_id, depth] of depths) {
    if (depth > max_depth) {
      max_depth = depth;
      deepest_class = entity_by_id.get(entity_id);
    }
  }

  // Group relationships by type
  const relationships_by_type = {};
  for (const rel of all_relationships) {
    if (!relationships_by_type[rel.relationship_type]) {
      relationships_by_type[rel.relationship_type] = [];
    }
    relationships_by_type[rel.relationship_type].push(rel);
  }

  return {
    all_relationships: all_relationships,
    root_classes: root_classes.map((e) => ({
      symbol: e.symbol,
      filename: e.filename,
      start_line: e.start_line,
      type: e.type
    })),
    leaf_classes: leaf_classes.map((e) => ({
      symbol: e.symbol,
      filename: e.filename,
      start_line: e.start_line,
      type: e.type
    })),
    abstract_classes: abstract_classes.map((e) => ({
      symbol: e.symbol,
      filename: e.filename,
      start_line: e.start_line
    })),
    by_relationship_type: relationships_by_type,
    deepest_inheritance: deepest_class
      ? {
          symbol: deepest_class.symbol,
          filename: deepest_class.filename,
          depth: max_depth
        }
      : null,
    summary: {
      total_classes: class_entities.length,
      total_relationships: all_relationships.length,
      root_class_count: root_classes.length,
      leaf_class_count: leaf_classes.length,
      abstract_class_count: abstract_classes.length,
      max_inheritance_depth: max_depth,
      extends_count: (relationships_by_type['extends'] || []).length,
      implements_count: (relationships_by_type['implements'] || []).length,
      embeds_count: (relationships_by_type['embeds'] || []).length,
      avg_children_per_class:
        class_entities.length > 0
          ? Math.round(
              (all_relationships.length / class_entities.length) * 10
            ) / 10
          : 0
    }
  };
};

// ============================================================================
// NAMING CONVENTION ANALYSIS
// ============================================================================

/**
 * Analyze naming conventions in a project.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Naming convention analysis results
 */
const analyze_project_naming_conventions = async (project_id) => {
  return await analyze_project_naming(project_id);
};

// ============================================================================
// READABILITY SCORE ANALYSIS
// ============================================================================

/**
 * Analyze code readability in a project.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Readability score analysis results
 */
const analyze_project_readability_score = async (project_id) => {
  return await analyze_project_readability(project_id);
};

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Detect design patterns and anti-patterns in a project.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Pattern detection results
 */
const analyze_project_design_patterns = async (project_id) => {
  return await analyze_project_patterns(project_id);
};

// ============================================================================
// TEST ANALYSIS
// ============================================================================

/**
 * Analyze test code and coverage patterns in a project.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Test analysis results
 */
const analyze_project_test_coverage = async (project_id) => {
  return await analyze_project_tests(project_id);
};

export {
  detect_dead_code,
  detect_code_duplication,
  analyze_dependencies,
  detect_security_vulnerabilities,
  get_code_metrics,
  detect_code_smells,
  analyze_types,
  analyze_api_surface,
  analyze_documentation,
  analyze_variable_scope,
  get_analysis_dashboard,
  // Cross-reference functions
  find_all_references,
  go_to_definition,
  list_definitions,
  get_symbol_reference_summary,
  find_symbols_at_location,
  // Class hierarchy functions
  get_class_hierarchy,
  find_implementations,
  analyze_class_hierarchy,
  // Concurrency analysis
  analyze_project_concurrency,
  // Resource analysis
  analyze_project_resources,
  // Naming convention analysis
  analyze_project_naming_conventions,
  // Readability score analysis
  analyze_project_readability_score,
  // Pattern detection
  analyze_project_design_patterns,
  // Test analysis
  analyze_project_test_coverage
};
