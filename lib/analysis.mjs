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
import { calculate_complexity, calculate_aggregate_complexity } from './complexity.mjs';

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
  const uncalledFunctions = await query`
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
  const entryPointPatterns = [
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

  const isLikelyEntryPoint = (symbol) => {
    return entryPointPatterns.some(pattern => pattern.test(symbol));
  };

  const deadFunctions = [];
  const potentialEntryPoints = [];

  for (const fn of uncalledFunctions) {
    if (isLikelyEntryPoint(fn.symbol)) {
      potentialEntryPoints.push({
        ...fn,
        reason: 'May be an entry point, event handler, or exported function'
      });
    } else {
      deadFunctions.push(fn);
    }
  }

  // Calculate total dead lines of code
  const totalDeadLines = deadFunctions.reduce((sum, fn) => sum + fn.lines, 0);

  // Get total project stats for comparison
  const totalStats = await query`
    SELECT COUNT(*) as total_functions,
           SUM(end_line - start_line + 1) as total_lines
    FROM entity
    WHERE project_id = ${project_id} AND type = 'function'
  `;

  return {
    dead_functions: deadFunctions,
    potential_entry_points: potentialEntryPoints,
    summary: {
      dead_function_count: deadFunctions.length,
      potential_entry_point_count: potentialEntryPoints.length,
      dead_lines_of_code: totalDeadLines,
      total_functions: parseInt(totalStats[0]?.total_functions || 0),
      total_lines: parseInt(totalStats[0]?.total_lines || 0),
      dead_code_percentage: totalStats[0]?.total_lines > 0
        ? Math.round((totalDeadLines / totalStats[0].total_lines) * 100 * 10) / 10
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
const normalizeSource = (source) => {
  if (!source) return '';
  return source
    .replace(/\/\/.*$/gm, '')           // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove multi-line comments
    .replace(/#.*$/gm, '')              // Remove Python comments
    .replace(/\s+/g, ' ')               // Normalize whitespace
    .trim()
    .toLowerCase();
};

/**
 * Calculate similarity between two strings using Jaccard similarity on tokens.
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score between 0 and 1
 */
const calculateSimilarity = (a, b) => {
  const tokensA = new Set(a.split(/\s+/).filter(t => t.length > 2));
  const tokensB = new Set(b.split(/\s+/).filter(t => t.length > 2));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
};

/**
 * Detect code duplication in a project.
 * Finds functions with similar source code.
 * @param {number} project_id - The project ID to analyze
 * @param {number} [similarityThreshold=0.7] - Minimum similarity to consider as duplicate
 * @returns {Promise<Object>} Duplication analysis results
 */
const detect_code_duplication = async (project_id, similarityThreshold = 0.7) => {
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
  const normalizedFunctions = functions.map(fn => ({
    ...fn,
    normalizedSource: normalizeSource(fn.source)
  }));

  // Compare each function with others
  for (let i = 0; i < normalizedFunctions.length; i++) {
    const fnA = normalizedFunctions[i];
    if (processed.has(fnA.id)) continue;

    const clones = [];

    for (let j = i + 1; j < normalizedFunctions.length; j++) {
      const fnB = normalizedFunctions[j];
      if (processed.has(fnB.id)) continue;

      // Skip if they're the same function
      if (fnA.id === fnB.id) continue;

      // Quick length check - if lengths differ by more than 50%, skip
      if (Math.abs(fnA.lines - fnB.lines) / Math.max(fnA.lines, fnB.lines) > 0.5) {
        continue;
      }

      const similarity = calculateSimilarity(fnA.normalizedSource, fnB.normalizedSource);

      if (similarity >= similarityThreshold) {
        clones.push({
          id: fnB.id,
          symbol: fnB.symbol,
          filename: fnB.filename,
          start_line: fnB.start_line,
          end_line: fnB.end_line,
          lines: fnB.lines,
          similarity: Math.round(similarity * 100)
        });
        processed.add(fnB.id);
      }
    }

    if (clones.length > 0) {
      processed.add(fnA.id);
      duplicates.push({
        original: {
          id: fnA.id,
          symbol: fnA.symbol,
          filename: fnA.filename,
          start_line: fnA.start_line,
          end_line: fnA.end_line,
          lines: fnA.lines
        },
        clones,
        total_duplicated_lines: clones.reduce((sum, c) => sum + c.lines, 0)
      });
    }
  }

  // Calculate summary statistics
  const totalDuplicatedLines = duplicates.reduce(
    (sum, d) => sum + d.total_duplicated_lines,
    0
  );

  const totalStats = await query`
    SELECT SUM(end_line - start_line + 1) as total_lines
    FROM entity
    WHERE project_id = ${project_id} AND type = 'function'
  `;

  return {
    duplicate_groups: duplicates,
    summary: {
      duplicate_group_count: duplicates.length,
      total_clone_count: duplicates.reduce((sum, d) => sum + d.clones.length, 0),
      duplicated_lines: totalDuplicatedLines,
      total_lines: parseInt(totalStats[0]?.total_lines || 0),
      duplication_percentage: totalStats[0]?.total_lines > 0
        ? Math.round((totalDuplicatedLines / totalStats[0].total_lines) * 100 * 10) / 10
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
  const fileDependencies = await query`
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

  for (const dep of fileDependencies) {
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
  const circularDependencies = [];
  const adjacency = new Map();

  for (const dep of fileDependencies) {
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
        const existing = circularDependencies.find(
          c => (c.file_a === target && c.file_b === source)
        );
        if (!existing) {
          circularDependencies.push({
            file_a: source,
            file_b: target
          });
        }
      }
    }
  }

  // Calculate coupling metrics
  const fileStats = Array.from(files.entries()).map(([filename, stats]) => ({
    filename,
    afferent_coupling: stats.exports, // Incoming dependencies (others depend on this)
    efferent_coupling: stats.imports, // Outgoing dependencies (this depends on others)
    instability: stats.imports + stats.exports > 0
      ? Math.round((stats.imports / (stats.imports + stats.exports)) * 100) / 100
      : 0
  }));

  // Sort by total coupling
  fileStats.sort((a, b) =>
    (b.afferent_coupling + b.efferent_coupling) - (a.afferent_coupling + a.efferent_coupling)
  );

  return {
    file_dependencies: edges,
    file_metrics: fileStats,
    circular_dependencies: circularDependencies,
    summary: {
      total_files: files.size,
      total_dependencies: edges.length,
      circular_dependency_count: circularDependencies.length,
      avg_dependencies_per_file: files.size > 0
        ? Math.round((edges.length / files.size) * 10) / 10
        : 0
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
    description: 'String concatenation in SQL queries can lead to SQL injection attacks'
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
    description: 'Executing shell commands with user input can lead to command injection'
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
    description: 'Hardcoded credentials should be stored securely in environment variables'
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
    description: 'File operations with user input can lead to unauthorized file access'
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
    description: 'Inserting unescaped user input into HTML can lead to XSS attacks'
  },
  {
    id: 'insecure_random',
    name: 'Insecure Random Number Generation',
    severity: 'low',
    patterns: [
      /Math\.random\s*\(/,
      /random\.random\s*\(/,
      /rand\s*\(\s*\)/
    ],
    description: 'Math.random() is not cryptographically secure. Use crypto.randomBytes() for security-sensitive operations'
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
    description: 'Debug statements should be removed before production deployment'
  },
  {
    id: 'unsafe_regex',
    name: 'Potentially Unsafe Regular Expression',
    severity: 'medium',
    patterns: [
      /\(\.\*\)\+/,
      /\(\.\+\)\+/,
      /\([^)]*\|[^)]*\)\+/
    ],
    description: 'Complex regex patterns can cause ReDoS (Regular Expression Denial of Service)'
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
  const severityCounts = { high: 0, medium: 0, low: 0 };

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
          severityCounts[pattern.severity]++;
          break; // Only report each pattern type once per function
        }
      }
    }
  }

  // Group by file
  const byFile = {};
  for (const vuln of vulnerabilities) {
    if (!byFile[vuln.filename]) {
      byFile[vuln.filename] = [];
    }
    byFile[vuln.filename].push(vuln);
  }

  return {
    vulnerabilities,
    by_file: byFile,
    summary: {
      total_vulnerabilities: vulnerabilities.length,
      high_severity: severityCounts.high,
      medium_severity: severityCounts.medium,
      low_severity: severityCounts.low,
      files_affected: Object.keys(byFile).length,
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
  const functionMetrics = functions.map(fn => {
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
  const mostComplex = [...functionMetrics]
    .sort((a, b) => b.cyclomatic - a.cyclomatic)
    .slice(0, 20);

  // Sort by lines of code for "largest functions" list
  const largestFunctions = [...functionMetrics]
    .sort((a, b) => b.loc - a.loc)
    .slice(0, 20);

  // Calculate aggregate metrics
  const aggregate = calculate_aggregate_complexity(functions);

  // Calculate metrics by file
  const byFile = {};
  for (const fn of functionMetrics) {
    if (!byFile[fn.filename]) {
      byFile[fn.filename] = {
        filename: fn.filename,
        function_count: 0,
        total_loc: 0,
        total_cyclomatic: 0,
        max_cyclomatic: 0,
        max_nesting: 0
      };
    }
    byFile[fn.filename].function_count++;
    byFile[fn.filename].total_loc += fn.loc;
    byFile[fn.filename].total_cyclomatic += fn.cyclomatic;
    byFile[fn.filename].max_cyclomatic = Math.max(
      byFile[fn.filename].max_cyclomatic,
      fn.cyclomatic
    );
    byFile[fn.filename].max_nesting = Math.max(
      byFile[fn.filename].max_nesting,
      fn.nesting_depth
    );
  }

  const fileMetrics = Object.values(byFile).map(file => ({
    ...file,
    avg_cyclomatic: Math.round((file.total_cyclomatic / file.function_count) * 10) / 10
  }));

  // Sort files by total complexity
  fileMetrics.sort((a, b) => b.total_cyclomatic - a.total_cyclomatic);

  // Calculate maintainability index (simplified version)
  // MI = 171 - 5.2 * ln(avgV) - 0.23 * avgCC - 16.2 * ln(avgLOC)
  // Using a simplified version based on cyclomatic complexity and LOC
  const avgLoc = aggregate.avg_loc || 1;
  const avgCC = aggregate.avg_cyclomatic || 1;
  const maintainabilityIndex = Math.max(0, Math.min(100,
    171 - 5.2 * Math.log(avgLoc * avgCC) - 0.23 * avgCC - 16.2 * Math.log(avgLoc)
  ));

  return {
    aggregate,
    most_complex: mostComplex,
    largest_functions: largestFunctions,
    file_metrics: fileMetrics,
    function_count: functionMetrics.length,
    maintainability_index: Math.round(maintainabilityIndex),
    maintainability_rating: maintainabilityIndex >= 80 ? 'High' :
                            maintainabilityIndex >= 60 ? 'Medium' :
                            maintainabilityIndex >= 40 ? 'Low' : 'Very Low'
  };
};

// ============================================================================
// CODE SMELL DETECTION
// ============================================================================

/**
 * Code smell thresholds for detection.
 */
const CODE_SMELL_THRESHOLDS = {
  longMethod: 50,           // Lines of code
  longParameterList: 5,     // Number of parameters
  highComplexity: 15,       // Cyclomatic complexity
  deepNesting: 4,           // Nesting depth
  godFunction: 200          // LOC for "god function"
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
  const nameFrequency = new Map();

  for (const fn of functions) {
    const complexity = calculate_complexity(fn);
    const lines = fn.end_line - fn.start_line + 1;

    // Track name frequency
    const baseName = fn.symbol.replace(/[0-9]+$/, ''); // Remove trailing numbers
    nameFrequency.set(baseName, (nameFrequency.get(baseName) || 0) + 1);

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
  for (const [name, count] of nameFrequency) {
    if (count > 2 && name.length > 3) {
      smells.duplicate_code_suspects.push({
        base_name: name,
        occurrence_count: count,
        severity: count > 5 ? 'medium' : 'low'
      });
    }
  }

  // Calculate summary
  const totalSmells =
    smells.long_methods.length +
    smells.long_parameter_lists.length +
    smells.high_complexity.length +
    smells.deep_nesting.length +
    smells.god_functions.length;

  return {
    smells,
    summary: {
      total_smells: totalSmells,
      long_methods: smells.long_methods.length,
      long_parameter_lists: smells.long_parameter_lists.length,
      high_complexity: smells.high_complexity.length,
      deep_nesting: smells.deep_nesting.length,
      god_functions: smells.god_functions.length,
      duplicate_suspects: smells.duplicate_code_suspects.length,
      functions_analyzed: functions.length,
      smell_density: functions.length > 0
        ? Math.round((totalSmells / functions.length) * 100 * 10) / 10
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
  const dynamicLanguages = ['javascript', 'python', 'ruby', 'php'];

  const typeAnalysis = {
    functions_without_type_hints: [],
    functions_with_type_hints: [],
    inferred_types: [],
    type_inconsistencies: []
  };

  // Type patterns for inference
  const typePatterns = {
    string: [/['"`]/, /\.toString\(/, /\.join\(/, /\.split\(/],
    number: [/\d+/, /Math\./, /\.toFixed\(/, /parseInt/, /parseFloat/],
    boolean: [/true|false/i, /!(?!=)/, /&&/, /\|\|/],
    array: [/\[.*\]/, /\.push\(/, /\.map\(/, /\.filter\(/, /\.reduce\(/],
    object: [/\{.*:.*\}/, /new\s+\w+\(/],
    promise: [/async/, /await/, /\.then\(/, /Promise\./],
    null: [/null/, /undefined/, /None/]
  };

  for (const fn of functions) {
    if (!dynamicLanguages.includes(fn.language)) continue;

    const hasTypeHints =
      (fn.language === 'python' && fn.source && /->\s*\w+/.test(fn.source)) ||
      (fn.language === 'javascript' && fn.return_type && fn.return_type !== 'function');

    if (hasTypeHints) {
      typeAnalysis.functions_with_type_hints.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        return_type: fn.return_type,
        language: fn.language
      });
    } else {
      // Try to infer return type from source
      let inferredType = 'unknown';
      if (fn.source) {
        // Look for return statements
        const returnMatch = fn.source.match(/return\s+([^;}\n]+)/);
        if (returnMatch) {
          const returnExpr = returnMatch[1];
          for (const [type, patterns] of Object.entries(typePatterns)) {
            if (patterns.some(p => p.test(returnExpr))) {
              inferredType = type;
              break;
            }
          }
        }
      }

      typeAnalysis.functions_without_type_hints.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        language: fn.language,
        inferred_return_type: inferredType
      });

      if (inferredType !== 'unknown') {
        typeAnalysis.inferred_types.push({
          id: fn.id,
          symbol: fn.symbol,
          filename: fn.filename,
          inferred_type: inferredType
        });
      }
    }
  }

  const dynamicFunctions = functions.filter(f => dynamicLanguages.includes(f.language));
  const typeCoverage = dynamicFunctions.length > 0
    ? Math.round((typeAnalysis.functions_with_type_hints.length / dynamicFunctions.length) * 100)
    : 100;

  return {
    ...typeAnalysis,
    summary: {
      total_dynamic_functions: dynamicFunctions.length,
      with_type_hints: typeAnalysis.functions_with_type_hints.length,
      without_type_hints: typeAnalysis.functions_without_type_hints.length,
      inferred_types: typeAnalysis.inferred_types.length,
      type_coverage_percentage: typeCoverage
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
  const publicPatterns = [
    /^export\s+/m,
    /^module\.exports/m,
    /^exports\./m,
    /^public\s+/m,
    /^def\s+[^_]/m,  // Python: non-underscore-prefixed
    /^func\s+[A-Z]/m  // Go: capitalized functions are exported
  ];

  const privatePatterns = [
    /^_/,              // Leading underscore
    /^__/,             // Double underscore (Python)
    /^private\s+/m,
    /^#/               // JavaScript private fields
  ];

  const publicFunctions = [];
  const privateFunctions = [];
  const entryPoints = [];

  for (const fn of functions) {
    const isPrivate = privatePatterns.some(p => p.test(fn.symbol)) ||
                      (fn.source && privatePatterns.some(p => p.test(fn.source)));

    const isPublic = !isPrivate && (
      publicPatterns.some(p => fn.source && p.test(fn.source)) ||
      fn.caller_count > 0
    );

    const fnData = {
      id: fn.id,
      symbol: fn.symbol,
      filename: fn.filename,
      start_line: fn.start_line,
      parameters: fn.parameters,
      return_type: fn.return_type,
      has_documentation: !!fn.comment,
      caller_count: parseInt(fn.caller_count)
    };

    if (isPrivate) {
      privateFunctions.push(fnData);
    } else {
      publicFunctions.push(fnData);

      // Entry points are public functions with many callers or specific names
      if (fn.caller_count >= 3 ||
          /^(main|init|setup|start|run|handler|app)$/i.test(fn.symbol)) {
        entryPoints.push(fnData);
      }
    }
  }

  // Undocumented public functions
  const undocumentedPublic = publicFunctions.filter(f => !f.has_documentation);

  // Calculate API complexity (average parameter count for public functions)
  const avgParams = publicFunctions.length > 0
    ? publicFunctions.reduce((sum, f) => {
        const paramCount = f.parameters ? f.parameters.split(',').length : 0;
        return sum + paramCount;
      }, 0) / publicFunctions.length
    : 0;

  return {
    public_functions: publicFunctions,
    private_functions: privateFunctions,
    entry_points: entryPoints,
    undocumented_public: undocumentedPublic,
    summary: {
      total_functions: functions.length,
      public_count: publicFunctions.length,
      private_count: privateFunctions.length,
      entry_point_count: entryPoints.length,
      undocumented_public_count: undocumentedPublic.length,
      public_ratio: functions.length > 0
        ? Math.round((publicFunctions.length / functions.length) * 100)
        : 0,
      documentation_coverage: publicFunctions.length > 0
        ? Math.round(((publicFunctions.length - undocumentedPublic.length) / publicFunctions.length) * 100)
        : 100,
      avg_api_complexity: Math.round(avgParams * 10) / 10
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
  const partiallyDocumented = [];

  for (const fn of functions) {
    const hasComment = !!fn.comment && fn.comment.trim().length > 10;

    // Check for parameter documentation
    const paramCount = fn.parameters ? fn.parameters.split(',').filter(p => p.trim()).length : 0;
    const hasParamDocs = fn.comment && (
      /@param/.test(fn.comment) ||
      /:param/.test(fn.comment) ||
      /Args:/.test(fn.comment) ||
      /Parameters:/.test(fn.comment)
    );

    // Check for return documentation
    const hasReturnDocs = fn.comment && (
      /@returns?/.test(fn.comment) ||
      /:returns?:/.test(fn.comment) ||
      /Returns:/.test(fn.comment)
    );

    const fnData = {
      id: fn.id,
      symbol: fn.symbol,
      filename: fn.filename,
      start_line: fn.start_line,
      has_comment: hasComment,
      has_param_docs: hasParamDocs,
      has_return_docs: hasReturnDocs,
      parameter_count: paramCount,
      return_type: fn.return_type
    };

    if (!hasComment) {
      undocumented.push(fnData);
    } else if (paramCount > 0 && !hasParamDocs) {
      partiallyDocumented.push({
        ...fnData,
        missing: 'parameter documentation'
      });
    } else if (fn.return_type && fn.return_type !== 'void' && !hasReturnDocs) {
      partiallyDocumented.push({
        ...fnData,
        missing: 'return value documentation'
      });
    } else {
      documented.push(fnData);
    }
  }

  // Group by file
  const byFile = {};
  for (const fn of functions) {
    if (!byFile[fn.filename]) {
      byFile[fn.filename] = { total: 0, documented: 0 };
    }
    byFile[fn.filename].total++;
    if (fn.comment && fn.comment.trim().length > 10) {
      byFile[fn.filename].documented++;
    }
  }

  const fileStats = Object.entries(byFile).map(([filename, stats]) => ({
    filename,
    ...stats,
    coverage: stats.total > 0 ? Math.round((stats.documented / stats.total) * 100) : 100
  }));

  fileStats.sort((a, b) => a.coverage - b.coverage);

  return {
    documented,
    undocumented,
    partially_documented: partiallyDocumented,
    by_file: fileStats,
    summary: {
      total_functions: functions.length,
      fully_documented: documented.length,
      undocumented: undocumented.length,
      partially_documented: partiallyDocumented.length,
      coverage_percentage: functions.length > 0
        ? Math.round((documented.length / functions.length) * 100)
        : 100,
      files_with_poor_coverage: fileStats.filter(f => f.coverage < 50).length
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

  const scopeIssues = {
    global_variables: [],
    variable_shadowing: [],
    mutable_closures: [],
    unused_variables: []
  };

  // Patterns for detecting scope issues
  const globalPatterns = {
    javascript: [/\bwindow\./, /\bglobal\./, /\bvar\s+\w+\s*=/],
    python: [/\bglobal\s+\w+/, /\bGLOBAL/],
    c: [/^[a-zA-Z_]\w*\s*=[^=]/m]  // Very simplistic
  };

  const letConstPatterns = /\b(let|const)\s+(\w+)/g;
  const varPatterns = /\bvar\s+(\w+)/g;

  for (const fn of functions) {
    const source = fn.source;
    const language = fn.language;

    // Check for global variable usage
    const langPatterns = globalPatterns[language] || [];
    for (const pattern of langPatterns) {
      if (pattern.test(source)) {
        scopeIssues.global_variables.push({
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
      const declaredVars = new Map();
      let match;

      // Reset lastIndex for global patterns
      letConstPatterns.lastIndex = 0;
      varPatterns.lastIndex = 0;

      while ((match = letConstPatterns.exec(source)) !== null) {
        const varName = match[2];
        if (declaredVars.has(varName)) {
          scopeIssues.variable_shadowing.push({
            id: fn.id,
            symbol: fn.symbol,
            filename: fn.filename,
            start_line: fn.start_line,
            variable: varName,
            severity: 'low'
          });
        }
        declaredVars.set(varName, true);
      }

      while ((match = varPatterns.exec(source)) !== null) {
        const varName = match[1];
        if (declaredVars.has(varName)) {
          scopeIssues.variable_shadowing.push({
            id: fn.id,
            symbol: fn.symbol,
            filename: fn.filename,
            start_line: fn.start_line,
            variable: varName,
            severity: 'low'
          });
        }
        declaredVars.set(varName, true);
      }
    }

    // Check for mutable closures (let variables used in callbacks)
    if ((language === 'javascript' || language === 'typescript') &&
        /\blet\s+\w+/.test(source) &&
        /\.(forEach|map|filter|reduce)\s*\(/.test(source)) {
      scopeIssues.mutable_closures.push({
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
    issues: scopeIssues,
    summary: {
      total_functions_analyzed: functions.length,
      global_variable_issues: scopeIssues.global_variables.length,
      shadowing_issues: scopeIssues.variable_shadowing.length,
      closure_issues: scopeIssues.mutable_closures.length,
      total_issues:
        scopeIssues.global_variables.length +
        scopeIssues.variable_shadowing.length +
        scopeIssues.mutable_closures.length +
        scopeIssues.unused_variables.length
    }
  };
};

// ============================================================================
// COMBINED ANALYSIS DASHBOARD
// ============================================================================

/**
 * Run all analyses and return a combined dashboard.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Combined analysis dashboard
 */
const get_analysis_dashboard = async (project_id) => {
  const [
    deadCode,
    duplication,
    dependencies,
    security,
    metrics,
    codeSmells,
    types,
    apiSurface,
    documentation,
    scopeAnalysis
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
  const healthFactors = [
    // Security: -20 points per high severity, -10 per medium, -5 per low
    Math.max(0, 100 - (security.summary.high_severity * 20) -
                      (security.summary.medium_severity * 10) -
                      (security.summary.low_severity * 5)),
    // Maintainability
    metrics.maintainability_index,
    // Documentation coverage
    documentation.summary.coverage_percentage,
    // Code smell density (inverse)
    Math.max(0, 100 - codeSmells.summary.smell_density * 2),
    // Dead code (inverse)
    Math.max(0, 100 - deadCode.summary.dead_code_percentage * 2),
    // Duplication (inverse)
    Math.max(0, 100 - duplication.summary.duplication_percentage * 2)
  ];

  const healthScore = Math.round(
    healthFactors.reduce((sum, f) => sum + f, 0) / healthFactors.length
  );

  return {
    health_score: healthScore,
    health_rating: healthScore >= 80 ? 'Excellent' :
                   healthScore >= 60 ? 'Good' :
                   healthScore >= 40 ? 'Fair' : 'Poor',
    summaries: {
      dead_code: deadCode.summary,
      duplication: duplication.summary,
      dependencies: dependencies.summary,
      security: security.summary,
      metrics: {
        total_functions: metrics.function_count,
        maintainability_index: metrics.maintainability_index,
        maintainability_rating: metrics.maintainability_rating,
        ...metrics.aggregate
      },
      code_smells: codeSmells.summary,
      types: types.summary,
      api_surface: apiSurface.summary,
      documentation: documentation.summary,
      scope: scopeAnalysis.summary
    }
  };
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
  get_analysis_dashboard
};
