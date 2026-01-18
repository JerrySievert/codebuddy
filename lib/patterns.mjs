'use strict';

/**
 * @fileoverview Design pattern detection module.
 * Detects common design patterns and anti-patterns in source code.
 * Computed on-demand from source code - no database changes required.
 * @module lib/patterns
 */

import { query } from './db.mjs';

/**
 * Design pattern definitions with detection strategies.
 */
const DESIGN_PATTERNS = {
  // Creational Patterns
  singleton: {
    name: 'Singleton',
    category: 'creational',
    description: 'Ensures a class has only one instance',
    indicators: {
      javascript: [
        /private\s+static\s+instance/i,
        /static\s+getInstance\s*\(/,
        /let\s+instance\s*=\s*null/,
        /if\s*\(\s*!instance\s*\)/,
        /Object\.freeze\s*\(/
      ],
      typescript: [
        /private\s+static\s+instance/,
        /static\s+getInstance\s*\(/,
        /private\s+constructor\s*\(/
      ],
      python: [
        /_instance\s*=\s*None/,
        /cls\._instance/,
        /__new__\s*\(/,
        /@singleton/
      ],
      java: [
        /private\s+static\s+\w+\s+instance/,
        /public\s+static\s+\w+\s+getInstance\s*\(/,
        /private\s+\w+\s*\(\s*\)/
      ],
      go: [/sync\.Once/, /var\s+once\s+sync\.Once/, /once\.Do\s*\(/],
      rust: [/lazy_static!/, /OnceCell/, /static\s+ref\s+/]
    }
  },

  factory: {
    name: 'Factory',
    category: 'creational',
    description: 'Creates objects without specifying exact class',
    indicators: {
      javascript: [
        /create\w*\s*\([^)]*\)\s*{[^}]*return\s+new\s+/,
        /function\s+\w*[Ff]actory/,
        /class\s+\w*[Ff]actory/,
        /switch\s*\([^)]+\)\s*{[^}]*case[^}]*:\s*return\s+new\s+/
      ],
      typescript: [
        /create\w*\s*\([^)]*\):\s*\w+\s*{[^}]*return\s+new\s+/,
        /class\s+\w*[Ff]actory/,
        /interface\s+\w*[Ff]actory/
      ],
      python: [
        /def\s+create\w*\s*\(/,
        /class\s+\w*[Ff]actory/,
        /@staticmethod\s*\n\s*def\s+create/
      ],
      java: [
        /public\s+(static\s+)?\w+\s+create\w*\s*\(/,
        /class\s+\w*[Ff]actory/,
        /interface\s+\w*[Ff]actory/
      ],
      go: [/func\s+New\w+\s*\(/, /func\s+Create\w+\s*\(/],
      rust: [/pub\s+fn\s+new\s*\(/, /impl\s+\w+\s*{[^}]*fn\s+new/]
    }
  },

  builder: {
    name: 'Builder',
    category: 'creational',
    description: 'Constructs complex objects step by step',
    indicators: {
      javascript: [
        /\.set\w+\s*\([^)]*\)\s*{\s*[^}]*return\s+this/,
        /\.with\w+\s*\([^)]*\)\s*{\s*[^}]*return\s+this/,
        /\.build\s*\(\s*\)/,
        /class\s+\w*[Bb]uilder/
      ],
      typescript: [
        /\.set\w+\s*\([^)]*\):\s*this\s*{/,
        /\.with\w+\s*\([^)]*\):\s*this\s*{/,
        /class\s+\w*[Bb]uilder/
      ],
      python: [
        /def\s+set_\w+\s*\([^)]*\):[^}]*return\s+self/,
        /def\s+with_\w+\s*\([^)]*\):[^}]*return\s+self/,
        /def\s+build\s*\(/,
        /class\s+\w*[Bb]uilder/
      ],
      java: [
        /public\s+\w+\s+set\w+\s*\([^)]*\)\s*{[^}]*return\s+this/,
        /public\s+\w+\s+with\w+\s*\([^)]*\)\s*{[^}]*return\s+this/,
        /public\s+\w+\s+build\s*\(\s*\)/,
        /class\s+\w*[Bb]uilder/
      ],
      go: [
        /func\s+\([^)]+\)\s+With\w+\s*\([^)]*\)\s+\*/,
        /func\s+\([^)]+\)\s+Build\s*\(\s*\)/
      ],
      rust: [/fn\s+with_\w+\s*\(mut\s+self/, /fn\s+build\s*\(self\)/]
    }
  },

  // Structural Patterns
  adapter: {
    name: 'Adapter',
    category: 'structural',
    description: 'Converts interface of a class into another interface',
    indicators: {
      javascript: [
        /class\s+\w*[Aa]dapter/,
        /constructor\s*\([^)]*adaptee/i,
        /this\.\w+\s*=\s*adaptee/i
      ],
      typescript: [
        /class\s+\w*[Aa]dapter\s+implements/,
        /private\s+\w*adaptee/i
      ],
      python: [
        /class\s+\w*[Aa]dapter/,
        /self\._adaptee\s*=/,
        /self\.adaptee\s*=/
      ],
      java: [/class\s+\w*[Aa]dapter\s+implements/, /private\s+\w+\s+adaptee/],
      go: [/type\s+\w*[Aa]dapter\s+struct/],
      rust: [/struct\s+\w*[Aa]dapter/]
    }
  },

  decorator: {
    name: 'Decorator',
    category: 'structural',
    description: 'Adds behavior to objects dynamically',
    indicators: {
      javascript: [
        /class\s+\w*[Dd]ecorator/,
        /@\w+\s*\n\s*(class|function)/,
        /function\s+\w*[Dd]ecorator/
      ],
      typescript: [
        /@\w+\s*\(\s*\)/,
        /class\s+\w*[Dd]ecorator/,
        /function\s+\w+\s*\([^)]*\):\s*ClassDecorator/
      ],
      python: [
        /@\w+\s*\n\s*(def|class)/,
        /def\s+\w*decorator\s*\(/,
        /functools\.wraps/
      ],
      java: [
        /class\s+\w*[Dd]ecorator\s+implements/,
        /@\w+\s*\n\s*(public|private|protected)/
      ],
      go: [/func\s+\w*[Dd]ecorator\s*\(/],
      rust: [/#\[\w+\]/, /proc_macro/]
    }
  },

  facade: {
    name: 'Facade',
    category: 'structural',
    description: 'Provides simplified interface to complex subsystem',
    indicators: {
      javascript: [
        /class\s+\w*[Ff]acade/,
        /constructor\s*\(\s*\)\s*{[^}]*(this\.\w+\s*=\s*new\s+\w+\(\);\s*){2,}/
      ],
      typescript: [/class\s+\w*[Ff]acade/],
      python: [/class\s+\w*[Ff]acade/],
      java: [/class\s+\w*[Ff]acade/],
      go: [/type\s+\w*[Ff]acade\s+struct/],
      rust: [/struct\s+\w*[Ff]acade/]
    }
  },

  proxy: {
    name: 'Proxy',
    category: 'structural',
    description: 'Controls access to another object',
    indicators: {
      javascript: [
        /new\s+Proxy\s*\(/,
        /class\s+\w*[Pp]roxy/,
        /Reflect\.(get|set|apply)/
      ],
      typescript: [/new\s+Proxy\s*\(/, /class\s+\w*[Pp]roxy/],
      python: [/class\s+\w*[Pp]roxy/, /__getattr__\s*\(/, /__setattr__\s*\(/],
      java: [
        /class\s+\w*[Pp]roxy\s+implements/,
        /java\.lang\.reflect\.Proxy/,
        /InvocationHandler/
      ],
      go: [/type\s+\w*[Pp]roxy\s+struct/],
      rust: [/struct\s+\w*[Pp]roxy/, /impl\s+Deref\s+for/]
    }
  },

  // Behavioral Patterns
  observer: {
    name: 'Observer',
    category: 'behavioral',
    description: 'Defines subscription mechanism for events',
    indicators: {
      javascript: [
        /addEventListener\s*\(/,
        /removeEventListener\s*\(/,
        /\.on\s*\(\s*['"`]\w+['"`]/,
        /\.emit\s*\(\s*['"`]\w+['"`]/,
        /\.subscribe\s*\(/,
        /\.unsubscribe\s*\(/,
        /EventEmitter/,
        /class\s+\w*[Oo]bserver/,
        /class\s+\w*[Ss]ubject/
      ],
      typescript: [
        /Observable/,
        /Subject/,
        /\.subscribe\s*\(/,
        /BehaviorSubject/,
        /ReplaySubject/
      ],
      python: [
        /def\s+attach\s*\(/,
        /def\s+detach\s*\(/,
        /def\s+notify\s*\(/,
        /self\._observers/,
        /class\s+\w*[Oo]bserver/
      ],
      java: [
        /implements\s+Observer/,
        /extends\s+Observable/,
        /addObserver\s*\(/,
        /notifyObservers\s*\(/,
        /PropertyChangeListener/
      ],
      go: [
        /type\s+\w*[Oo]bserver\s+interface/,
        /func\s+\([^)]+\)\s+Subscribe\s*\(/,
        /func\s+\([^)]+\)\s+Notify\s*\(/
      ],
      rust: [
        /trait\s+\w*[Oo]bserver/,
        /fn\s+subscribe\s*\(/,
        /fn\s+notify\s*\(/
      ]
    }
  },

  strategy: {
    name: 'Strategy',
    category: 'behavioral',
    description: 'Defines family of interchangeable algorithms',
    indicators: {
      javascript: [
        /class\s+\w*[Ss]trategy/,
        /setStrategy\s*\(/,
        /this\.strategy\s*=/,
        /interface\s+\w*[Ss]trategy/
      ],
      typescript: [
        /interface\s+\w*[Ss]trategy/,
        /class\s+\w*[Ss]trategy/,
        /setStrategy\s*\([^)]*:\s*\w*[Ss]trategy/
      ],
      python: [
        /class\s+\w*[Ss]trategy/,
        /self\._strategy\s*=/,
        /def\s+set_strategy\s*\(/,
        /from\s+abc\s+import.*ABC/
      ],
      java: [
        /interface\s+\w*[Ss]trategy/,
        /class\s+\w*[Ss]trategy/,
        /void\s+setStrategy\s*\(/
      ],
      go: [/type\s+\w*[Ss]trategy\s+interface/],
      rust: [/trait\s+\w*[Ss]trategy/]
    }
  },

  command: {
    name: 'Command',
    category: 'behavioral',
    description: 'Encapsulates request as an object',
    indicators: {
      javascript: [
        /class\s+\w*[Cc]ommand/,
        /execute\s*\(\s*\)\s*{/,
        /undo\s*\(\s*\)\s*{/,
        /interface\s+\w*[Cc]ommand/
      ],
      typescript: [
        /interface\s+\w*[Cc]ommand\s*{[^}]*execute/,
        /class\s+\w*[Cc]ommand/
      ],
      python: [
        /class\s+\w*[Cc]ommand/,
        /def\s+execute\s*\(self\)/,
        /def\s+undo\s*\(self\)/
      ],
      java: [
        /interface\s+\w*[Cc]ommand/,
        /void\s+execute\s*\(\s*\)/,
        /void\s+undo\s*\(\s*\)/
      ],
      go: [/type\s+\w*[Cc]ommand\s+interface/, /Execute\s*\(\s*\)/],
      rust: [/trait\s+\w*[Cc]ommand/, /fn\s+execute\s*\(/]
    }
  },

  state: {
    name: 'State',
    category: 'behavioral',
    description: 'Allows object to alter behavior when state changes',
    indicators: {
      javascript: [
        /class\s+\w*[Ss]tate/,
        /this\.state\s*=\s*new\s+\w+State/,
        /setState\s*\(/,
        /interface\s+\w*[Ss]tate/
      ],
      typescript: [
        /interface\s+\w*[Ss]tate/,
        /class\s+\w*[Ss]tate\s+implements/
      ],
      python: [
        /class\s+\w*[Ss]tate/,
        /self\._state\s*=/,
        /def\s+transition_to\s*\(/
      ],
      java: [
        /interface\s+\w*[Ss]tate/,
        /class\s+\w*[Ss]tate\s+implements/,
        /void\s+setState\s*\(/
      ],
      go: [/type\s+\w*[Ss]tate\s+interface/],
      rust: [/trait\s+\w*[Ss]tate/, /enum\s+\w*[Ss]tate/]
    }
  },

  iterator: {
    name: 'Iterator',
    category: 'behavioral',
    description: 'Provides way to access elements sequentially',
    indicators: {
      javascript: [
        /\[Symbol\.iterator\]/,
        /function\*\s*\(/,
        /yield\s+/,
        /\.next\s*\(\s*\)/,
        /for\s*\.\.\.\s*of/
      ],
      typescript: [
        /\[Symbol\.iterator\]/,
        /implements\s+Iterable/,
        /implements\s+Iterator/
      ],
      python: [
        /__iter__\s*\(/,
        /__next__\s*\(/,
        /yield\s+/,
        /class\s+\w*[Ii]terator/
      ],
      java: [
        /implements\s+Iterator/,
        /implements\s+Iterable/,
        /hasNext\s*\(\s*\)/,
        /next\s*\(\s*\)/
      ],
      go: [
        /func\s+\([^)]+\)\s+Next\s*\(\s*\)/,
        /func\s+\([^)]+\)\s+HasNext\s*\(\s*\)/
      ],
      rust: [/impl\s+Iterator\s+for/, /fn\s+next\s*\(&mut\s+self\)/]
    }
  },

  // Anti-patterns
  callback_hell: {
    name: 'Callback Hell',
    category: 'anti-pattern',
    description: 'Deeply nested callbacks making code hard to read',
    indicators: {
      javascript: [
        /\(\s*\)\s*=>\s*{[^}]*\(\s*\)\s*=>\s*{[^}]*\(\s*\)\s*=>\s*{/,
        /function\s*\([^)]*\)\s*{[^}]*function\s*\([^)]*\)\s*{[^}]*function\s*\([^)]*\)\s*{/,
        /\.then\s*\([^)]*\)\s*\.then\s*\([^)]*\)\s*\.then\s*\([^)]*\)\s*\.then/
      ],
      typescript: [
        /\(\s*\)\s*=>\s*{[^}]*\(\s*\)\s*=>\s*{[^}]*\(\s*\)\s*=>\s*{/,
        /\.then\s*\([^)]*\)\s*\.then\s*\([^)]*\)\s*\.then\s*\([^)]*\)\s*\.then/
      ],
      python: [],
      java: [],
      go: [],
      rust: []
    }
  },

  god_class: {
    name: 'God Class',
    category: 'anti-pattern',
    description: 'Class that knows too much or does too much',
    // Detected by metrics rather than patterns
    indicators: {}
  },

  spaghetti_code: {
    name: 'Spaghetti Code',
    category: 'anti-pattern',
    description: 'Code with complex and tangled control structure',
    // Detected by metrics (high cyclomatic complexity, deep nesting)
    indicators: {}
  }
};

/**
 * Error handling patterns to detect.
 */
const ERROR_HANDLING_PATTERNS = {
  try_catch: {
    javascript: /try\s*{[^}]*}\s*catch/g,
    typescript: /try\s*{[^}]*}\s*catch/g,
    python: /try\s*:[^:]*except/g,
    java: /try\s*{[^}]*}\s*catch/g,
    go: /if\s+err\s*!=\s*nil/g,
    rust: /\?\s*;|\.unwrap\(\)|match.*Err/g
  },
  empty_catch: {
    javascript: /catch\s*\([^)]*\)\s*{\s*}/g,
    typescript: /catch\s*\([^)]*\)\s*{\s*}/g,
    python: /except\s*:\s*pass/g,
    java: /catch\s*\([^)]*\)\s*{\s*}/g,
    go: /if\s+err\s*!=\s*nil\s*{\s*}/g,
    rust: /\.unwrap\(\)/g
  },
  finally_block: {
    javascript: /finally\s*{/g,
    typescript: /finally\s*{/g,
    python: /finally\s*:/g,
    java: /finally\s*{/g,
    go: /defer\s+/g,
    rust: /Drop\s+for/g
  }
};

/**
 * Detect patterns in source code.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {Object} Detected patterns
 */
const detect_patterns_in_source = (source, language) => {
  const detected = [];
  const lang = language.toLowerCase();

  for (const [pattern_id, pattern] of Object.entries(DESIGN_PATTERNS)) {
    const indicators =
      pattern.indicators[lang] || pattern.indicators.javascript || [];

    for (const indicator of indicators) {
      if (indicator.test(source)) {
        detected.push({
          id: pattern_id,
          name: pattern.name,
          category: pattern.category,
          description: pattern.description
        });
        break; // Only count once per pattern type
      }
    }
  }

  return detected;
};

/**
 * Analyze error handling in source code.
 * @param {string} source - Source code
 * @param {string} language - Programming language
 * @returns {Object} Error handling analysis
 */
const analyze_error_handling = (source, language) => {
  const lang = language.toLowerCase();
  const result = {
    try_catch_count: 0,
    empty_catch_count: 0,
    finally_count: 0,
    coverage: 'unknown'
  };

  const try_catch_pattern = ERROR_HANDLING_PATTERNS.try_catch[lang];
  const empty_catch_pattern = ERROR_HANDLING_PATTERNS.empty_catch[lang];
  const finally_pattern = ERROR_HANDLING_PATTERNS.finally_block[lang];

  if (try_catch_pattern) {
    const matches = source.match(try_catch_pattern);
    result.try_catch_count = matches ? matches.length : 0;
  }

  if (empty_catch_pattern) {
    const matches = source.match(empty_catch_pattern);
    result.empty_catch_count = matches ? matches.length : 0;
  }

  if (finally_pattern) {
    const matches = source.match(finally_pattern);
    result.finally_count = matches ? matches.length : 0;
  }

  // Calculate coverage rating
  if (result.try_catch_count === 0) {
    result.coverage = 'none';
  } else if (result.empty_catch_count > result.try_catch_count / 2) {
    result.coverage = 'poor';
  } else if (result.finally_count > 0) {
    result.coverage = 'good';
  } else {
    result.coverage = 'moderate';
  }

  return result;
};

/**
 * Analyze patterns for a project.
 * @param {number} projectId - The project ID
 * @returns {Promise<Object>} Pattern analysis results
 */
const analyze_project_patterns = async (projectId) => {
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
      functions_with_patterns: 0,
      total_patterns_detected: 0,
      patterns_by_category: {
        creational: 0,
        structural: 0,
        behavioral: 0,
        'anti-pattern': 0
      },
      error_handling: {
        total_try_catch: 0,
        total_empty_catch: 0,
        total_finally: 0,
        functions_with_error_handling: 0
      }
    },
    patterns: {},
    pattern_locations: [],
    anti_patterns: [],
    error_handling_issues: [],
    by_file: {}
  };

  // Initialize pattern counts
  for (const pattern_id of Object.keys(DESIGN_PATTERNS)) {
    results.patterns[pattern_id] = {
      name: DESIGN_PATTERNS[pattern_id].name,
      category: DESIGN_PATTERNS[pattern_id].category,
      count: 0,
      locations: []
    };
  }

  for (const entity of entities) {
    const { symbol, filename, type, language, source, start_line } = entity;

    if (!source) continue;

    // Detect design patterns
    const detected = detect_patterns_in_source(source, language);

    if (detected.length > 0) {
      results.summary.functions_with_patterns++;

      for (const pattern of detected) {
        results.patterns[pattern.id].count++;
        results.patterns[pattern.id].locations.push({
          symbol,
          filename,
          line: start_line,
          type
        });

        results.summary.patterns_by_category[pattern.category]++;
        results.summary.total_patterns_detected++;

        results.pattern_locations.push({
          pattern_id: pattern.id,
          pattern_name: pattern.name,
          category: pattern.category,
          symbol,
          filename,
          line: start_line
        });

        // Track anti-patterns separately
        if (pattern.category === 'anti-pattern') {
          results.anti_patterns.push({
            pattern: pattern.name,
            description: pattern.description,
            symbol,
            filename,
            line: start_line
          });
        }
      }
    }

    // Analyze error handling
    const error_handling = analyze_error_handling(source, language);
    results.summary.error_handling.total_try_catch +=
      error_handling.try_catch_count;
    results.summary.error_handling.total_empty_catch +=
      error_handling.empty_catch_count;
    results.summary.error_handling.total_finally +=
      error_handling.finally_count;

    if (error_handling.try_catch_count > 0) {
      results.summary.error_handling.functions_with_error_handling++;
    }

    // Track empty catch blocks as issues
    if (error_handling.empty_catch_count > 0) {
      results.error_handling_issues.push({
        type: 'empty_catch',
        count: error_handling.empty_catch_count,
        symbol,
        filename,
        line: start_line,
        severity: 'warning',
        message: `${error_handling.empty_catch_count} empty catch block(s) - exceptions may be silently ignored`
      });
    }

    // Track by file
    if (!results.by_file[filename]) {
      results.by_file[filename] = { patterns: [], error_handling_issues: 0 };
    }
    for (const p of detected) {
      if (!results.by_file[filename].patterns.includes(p.name)) {
        results.by_file[filename].patterns.push(p.name);
      }
    }
    results.by_file[filename].error_handling_issues +=
      error_handling.empty_catch_count;
  }

  // Filter out patterns with zero counts
  const active_patterns = {};
  for (const [id, data] of Object.entries(results.patterns)) {
    if (data.count > 0) {
      active_patterns[id] = data;
    }
  }
  results.patterns = active_patterns;

  // Sort pattern locations by frequency
  results.pattern_locations.sort((a, b) => {
    const count_a = results.patterns[a.pattern_id]?.count || 0;
    const count_b = results.patterns[b.pattern_id]?.count || 0;
    return count_b - count_a;
  });

  // Limit results
  if (results.pattern_locations.length > 100) {
    results.pattern_locations_truncated = true;
    results.pattern_locations = results.pattern_locations.slice(0, 100);
  }

  if (results.error_handling_issues.length > 50) {
    results.error_handling_issues_truncated = true;
    results.error_handling_issues = results.error_handling_issues.slice(0, 50);
  }

  return results;
};

export {
  analyze_project_patterns,
  detect_patterns_in_source,
  analyze_error_handling,
  DESIGN_PATTERNS,
  ERROR_HANDLING_PATTERNS
};
