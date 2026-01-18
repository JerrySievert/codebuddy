'use strict';

/**
 * @fileoverview Memory and resource analysis module.
 * Tracks resource acquisition/release patterns and detects potential leaks.
 * Computed on-demand from source code - no database changes required.
 * @module lib/resources
 */

import { query } from './db.mjs';

/**
 * Language-specific resource patterns to detect.
 * Each pattern has an acquire and release pair, along with detection patterns.
 */
const RESOURCE_PATTERNS = {
  c: {
    memory: [
      {
        name: 'malloc/free',
        acquire: /\bmalloc\s*\(/,
        release: /\bfree\s*\(/,
        description: 'Dynamic memory allocation'
      },
      {
        name: 'calloc/free',
        acquire: /\bcalloc\s*\(/,
        release: /\bfree\s*\(/,
        description: 'Zero-initialized memory allocation'
      },
      {
        name: 'realloc',
        acquire: /\brealloc\s*\(/,
        release: /\bfree\s*\(/,
        description: 'Memory reallocation'
      }
    ],
    file: [
      {
        name: 'fopen/fclose',
        acquire: /\bfopen\s*\(/,
        release: /\bfclose\s*\(/,
        description: 'File handle'
      },
      {
        name: 'open/close',
        acquire: /\bopen\s*\(/,
        release: /\bclose\s*\(/,
        description: 'File descriptor'
      },
      {
        name: 'fdopen/fclose',
        acquire: /\bfdopen\s*\(/,
        release: /\bfclose\s*\(/,
        description: 'File stream from descriptor'
      }
    ],
    network: [
      {
        name: 'socket/close',
        acquire: /\bsocket\s*\(/,
        release: /\bclose\s*\(/,
        description: 'Network socket'
      }
    ],
    thread: [
      {
        name: 'pthread_mutex_init/destroy',
        acquire: /\bpthread_mutex_init\s*\(/,
        release: /\bpthread_mutex_destroy\s*\(/,
        description: 'Mutex initialization'
      },
      {
        name: 'pthread_cond_init/destroy',
        acquire: /\bpthread_cond_init\s*\(/,
        release: /\bpthread_cond_destroy\s*\(/,
        description: 'Condition variable initialization'
      }
    ]
  },

  cpp: {
    memory: [
      {
        name: 'new/delete',
        acquire: /\bnew\s+\w/,
        release: /\bdelete\s+/,
        description: 'Dynamic object allocation'
      },
      {
        name: 'new[]/delete[]',
        acquire: /\bnew\s*\[/,
        release: /\bdelete\s*\[\s*\]/,
        description: 'Dynamic array allocation'
      },
      {
        name: 'malloc/free',
        acquire: /\bmalloc\s*\(/,
        release: /\bfree\s*\(/,
        description: 'C-style memory allocation'
      }
    ],
    smart_pointers: [
      {
        name: 'unique_ptr',
        pattern: /\bstd::unique_ptr</,
        safe: true,
        description: 'Unique ownership smart pointer'
      },
      {
        name: 'shared_ptr',
        pattern: /\bstd::shared_ptr</,
        safe: true,
        description: 'Shared ownership smart pointer'
      },
      {
        name: 'weak_ptr',
        pattern: /\bstd::weak_ptr</,
        safe: true,
        description: 'Weak reference smart pointer'
      },
      {
        name: 'make_unique',
        pattern: /\bstd::make_unique</,
        safe: true,
        description: 'Safe unique_ptr creation'
      },
      {
        name: 'make_shared',
        pattern: /\bstd::make_shared</,
        safe: true,
        description: 'Safe shared_ptr creation'
      }
    ],
    file: [
      {
        name: 'fstream',
        pattern: /\b(i|o|f)fstream\b/,
        safe: true,
        description: 'RAII file stream'
      },
      {
        name: 'fopen/fclose',
        acquire: /\bfopen\s*\(/,
        release: /\bfclose\s*\(/,
        description: 'C-style file handle'
      }
    ],
    lock: [
      {
        name: 'lock_guard',
        pattern: /\bstd::lock_guard</,
        safe: true,
        description: 'RAII lock guard'
      },
      {
        name: 'unique_lock',
        pattern: /\bstd::unique_lock</,
        safe: true,
        description: 'RAII unique lock'
      },
      {
        name: 'scoped_lock',
        pattern: /\bstd::scoped_lock</,
        safe: true,
        description: 'RAII scoped lock'
      }
    ]
  },

  javascript: {
    timer: [
      {
        name: 'setTimeout/clearTimeout',
        acquire: /\bsetTimeout\s*\(/,
        release: /\bclearTimeout\s*\(/,
        description: 'Timer handle'
      },
      {
        name: 'setInterval/clearInterval',
        acquire: /\bsetInterval\s*\(/,
        release: /\bclearInterval\s*\(/,
        description: 'Interval handle'
      }
    ],
    event: [
      {
        name: 'addEventListener/removeEventListener',
        acquire: /\.addEventListener\s*\(/,
        release: /\.removeEventListener\s*\(/,
        description: 'Event listener'
      },
      {
        name: 'on/off',
        acquire: /\.on\s*\(\s*['"`]/,
        release: /\.off\s*\(\s*['"`]/,
        description: 'Event emitter listener'
      }
    ],
    stream: [
      {
        name: 'createReadStream',
        acquire: /\.createReadStream\s*\(/,
        release: /\.close\s*\(|\.destroy\s*\(/,
        description: 'Read stream'
      },
      {
        name: 'createWriteStream',
        acquire: /\.createWriteStream\s*\(/,
        release: /\.close\s*\(|\.end\s*\(/,
        description: 'Write stream'
      }
    ]
  },

  typescript: {
    // TypeScript inherits JavaScript patterns
    timer: [
      {
        name: 'setTimeout/clearTimeout',
        acquire: /\bsetTimeout\s*\(/,
        release: /\bclearTimeout\s*\(/,
        description: 'Timer handle'
      },
      {
        name: 'setInterval/clearInterval',
        acquire: /\bsetInterval\s*\(/,
        release: /\bclearInterval\s*\(/,
        description: 'Interval handle'
      }
    ],
    event: [
      {
        name: 'addEventListener/removeEventListener',
        acquire: /\.addEventListener\s*\(/,
        release: /\.removeEventListener\s*\(/,
        description: 'Event listener'
      }
    ],
    stream: [
      {
        name: 'createReadStream',
        acquire: /\.createReadStream\s*\(/,
        release: /\.close\s*\(|\.destroy\s*\(/,
        description: 'Read stream'
      }
    ]
  },

  python: {
    file: [
      {
        name: 'open',
        acquire: /\bopen\s*\(/,
        release: /\.close\s*\(/,
        with_statement: /\bwith\s+open\s*\(/,
        description: 'File handle'
      }
    ],
    context_manager: [
      {
        name: 'with statement',
        pattern: /\bwith\s+/,
        safe: true,
        description: 'Context manager (automatic cleanup)'
      }
    ],
    database: [
      {
        name: 'connection',
        acquire: /\.connect\s*\(/,
        release: /\.close\s*\(/,
        description: 'Database connection'
      },
      {
        name: 'cursor',
        acquire: /\.cursor\s*\(/,
        release: /\.close\s*\(/,
        description: 'Database cursor'
      }
    ],
    network: [
      {
        name: 'socket',
        acquire: /\bsocket\.socket\s*\(/,
        release: /\.close\s*\(/,
        description: 'Network socket'
      }
    ]
  },

  java: {
    resource: [
      {
        name: 'try-with-resources',
        pattern: /\btry\s*\(\s*\w/,
        safe: true,
        description: 'Automatic resource management'
      }
    ],
    stream: [
      {
        name: 'InputStream',
        acquire: /new\s+\w*InputStream\s*\(/,
        release: /\.close\s*\(/,
        description: 'Input stream'
      },
      {
        name: 'OutputStream',
        acquire: /new\s+\w*OutputStream\s*\(/,
        release: /\.close\s*\(/,
        description: 'Output stream'
      },
      {
        name: 'Reader',
        acquire: /new\s+\w*Reader\s*\(/,
        release: /\.close\s*\(/,
        description: 'Character reader'
      },
      {
        name: 'Writer',
        acquire: /new\s+\w*Writer\s*\(/,
        release: /\.close\s*\(/,
        description: 'Character writer'
      }
    ],
    database: [
      {
        name: 'Connection',
        acquire: /\.getConnection\s*\(/,
        release: /\.close\s*\(/,
        description: 'JDBC connection'
      },
      {
        name: 'Statement',
        acquire: /\.createStatement\s*\(|\.prepareStatement\s*\(/,
        release: /\.close\s*\(/,
        description: 'JDBC statement'
      },
      {
        name: 'ResultSet',
        acquire: /\.executeQuery\s*\(/,
        release: /\.close\s*\(/,
        description: 'JDBC result set'
      }
    ]
  },

  csharp: {
    resource: [
      {
        name: 'using statement',
        pattern:
          /\busing\s*\(\s*var\s+\w|\busing\s*\(\s*\w+\s+\w|\busing\s+var\s+/,
        safe: true,
        description: 'Automatic disposal (IDisposable)'
      }
    ],
    disposable: [
      {
        name: 'IDisposable',
        acquire: /new\s+\w+\s*\(/,
        release: /\.Dispose\s*\(/,
        description: 'Disposable object'
      }
    ],
    stream: [
      {
        name: 'Stream',
        acquire: /new\s+\w*Stream\s*\(/,
        release: /\.Close\s*\(|\.Dispose\s*\(/,
        description: 'Stream object'
      },
      {
        name: 'Reader',
        acquire: /new\s+\w*Reader\s*\(/,
        release: /\.Close\s*\(|\.Dispose\s*\(/,
        description: 'Reader object'
      },
      {
        name: 'Writer',
        acquire: /new\s+\w*Writer\s*\(/,
        release: /\.Close\s*\(|\.Dispose\s*\(/,
        description: 'Writer object'
      }
    ]
  },

  go: {
    defer: [
      {
        name: 'defer statement',
        pattern: /\bdefer\s+/,
        safe: true,
        description: 'Deferred cleanup'
      }
    ],
    file: [
      {
        name: 'os.Open/Close',
        acquire: /\bos\.Open\s*\(|os\.Create\s*\(/,
        release: /\.Close\s*\(/,
        description: 'File handle'
      }
    ],
    network: [
      {
        name: 'net.Dial/Close',
        acquire: /\bnet\.Dial\s*\(/,
        release: /\.Close\s*\(/,
        description: 'Network connection'
      },
      {
        name: 'http.Get/Close',
        acquire: /\bhttp\.Get\s*\(|http\.Post\s*\(/,
        release: /\.Body\.Close\s*\(/,
        description: 'HTTP response body'
      }
    ],
    database: [
      {
        name: 'sql.Open/Close',
        acquire: /\bsql\.Open\s*\(/,
        release: /\.Close\s*\(/,
        description: 'Database connection'
      },
      {
        name: 'Rows/Close',
        acquire: /\.Query\s*\(|\.QueryRow\s*\(/,
        release: /\.Close\s*\(/,
        description: 'Query result rows'
      }
    ]
  },

  rust: {
    // Rust has automatic memory management via ownership
    ownership: [
      {
        name: 'Box',
        pattern: /\bBox::(new|from)\s*\(/,
        safe: true,
        description: 'Heap allocation with ownership'
      },
      {
        name: 'Rc',
        pattern: /\bRc::(new|clone)\s*\(/,
        safe: true,
        description: 'Reference counted pointer'
      },
      {
        name: 'Arc',
        pattern: /\bArc::(new|clone)\s*\(/,
        safe: true,
        description: 'Atomic reference counted pointer'
      }
    ],
    unsafe_memory: [
      {
        name: 'unsafe alloc',
        acquire: /\balloc\s*\(|alloc_zeroed\s*\(/,
        release: /\bdealloc\s*\(/,
        description: 'Unsafe memory allocation'
      },
      {
        name: 'Box::into_raw/from_raw',
        acquire: /\bBox::into_raw\s*\(/,
        release: /\bBox::from_raw\s*\(/,
        description: 'Raw pointer from Box'
      }
    ],
    file: [
      {
        name: 'File::open',
        pattern: /\bFile::open\s*\(|File::create\s*\(/,
        safe: true,
        description: 'File handle (RAII)'
      }
    ]
  }
};

/**
 * Analyze resource patterns in a single function.
 * @param {Object} fn - Function entity with source code
 * @returns {Object} Resource findings for the function
 */
const analyze_function_resources = (fn) => {
  const source = fn.source || '';
  const language = fn.language;
  const patterns = RESOURCE_PATTERNS[language] || {};

  const findings = {
    acquisitions: [],
    releases: [],
    safe_patterns: [],
    potential_leaks: [],
    warnings: []
  };

  // Check each category of patterns
  for (const [category, pattern_list] of Object.entries(patterns)) {
    for (const p of pattern_list || []) {
      // Check for safe patterns (RAII, smart pointers, context managers, etc.)
      if (p.safe && p.pattern && p.pattern.test(source)) {
        findings.safe_patterns.push({
          name: p.name,
          category,
          description: p.description,
          function_id: fn.id,
          symbol: fn.symbol,
          filename: fn.filename,
          start_line: fn.start_line
        });
        continue;
      }

      // Check for acquire/release pairs
      const has_acquire = p.acquire && p.acquire.test(source);
      const has_release = p.release && p.release.test(source);
      const has_with_statement =
        p.with_statement && p.with_statement.test(source);

      if (has_acquire) {
        findings.acquisitions.push({
          name: p.name,
          category,
          description: p.description,
          function_id: fn.id,
          symbol: fn.symbol,
          filename: fn.filename,
          start_line: fn.start_line
        });

        // Check if there's a corresponding release or safe pattern
        if (!has_release && !has_with_statement) {
          // Check if defer is used (Go) or if it's a safe context
          const has_defer = language === 'go' && /\bdefer\s+/.test(source);
          const has_try_with_resources =
            language === 'java' && /\btry\s*\([^)]*\)\s*\{/.test(source);
          const has_using =
            language === 'csharp' && /\busing\s*\(/.test(source);
          const has_with = language === 'python' && /\bwith\s+/.test(source);

          if (
            !has_defer &&
            !has_try_with_resources &&
            !has_using &&
            !has_with
          ) {
            findings.potential_leaks.push({
              name: p.name,
              category,
              description: `${p.description} acquired but release not found in same function`,
              severity: 'warning',
              function_id: fn.id,
              symbol: fn.symbol,
              filename: fn.filename,
              start_line: fn.start_line
            });
          }
        }
      }

      if (has_release) {
        findings.releases.push({
          name: p.name,
          category,
          description: p.description,
          function_id: fn.id,
          symbol: fn.symbol,
          filename: fn.filename,
          start_line: fn.start_line
        });
      }
    }
  }

  // Language-specific warnings
  if (language === 'cpp') {
    // Check for raw new without smart pointers
    if (
      /\bnew\s+\w/.test(source) &&
      !/std::(unique_ptr|shared_ptr|make_unique|make_shared)/.test(source)
    ) {
      findings.warnings.push({
        id: 'raw_new_without_smart_ptr',
        description:
          'Using raw new without smart pointers - consider using std::make_unique or std::make_shared',
        severity: 'suggestion',
        function_id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line
      });
    }
  }

  if (language === 'c') {
    // Check for malloc without null check
    if (
      /\bmalloc\s*\(/.test(source) &&
      !/if\s*\(\s*\w+\s*(==|!=)\s*(NULL|0|nullptr)/.test(source)
    ) {
      findings.warnings.push({
        id: 'malloc_no_null_check',
        description: 'malloc() called without apparent null check',
        severity: 'warning',
        function_id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line
      });
    }
  }

  return findings;
};

/**
 * Analyze resource patterns across all functions in a project.
 * @param {number} project_id - The project ID to analyze
 * @returns {Promise<Object>} Resource analysis results
 */
const analyze_project_resources = async (project_id) => {
  const functions = await query`
    SELECT id, symbol, filename, start_line, end_line, source, language
    FROM entity
    WHERE project_id = ${project_id}
      AND type = 'function'
      AND source IS NOT NULL
    ORDER BY filename, start_line
  `;

  const results = {
    functions_with_resources: [],
    acquisitions: [],
    releases: [],
    safe_patterns: [],
    potential_leaks: [],
    warnings: [],
    by_file: {},
    by_language: {},
    by_category: {}
  };

  for (const fn of functions) {
    const findings = analyze_function_resources(fn);

    // Check if this function has any resource patterns
    const has_resources =
      findings.acquisitions.length > 0 ||
      findings.releases.length > 0 ||
      findings.safe_patterns.length > 0;

    if (has_resources || findings.potential_leaks.length > 0) {
      results.functions_with_resources.push({
        id: fn.id,
        symbol: fn.symbol,
        filename: fn.filename,
        start_line: fn.start_line,
        language: fn.language,
        counts: {
          acquisitions: findings.acquisitions.length,
          releases: findings.releases.length,
          safe_patterns: findings.safe_patterns.length,
          potential_leaks: findings.potential_leaks.length
        }
      });

      // Aggregate findings
      results.acquisitions.push(...findings.acquisitions);
      results.releases.push(...findings.releases);
      results.safe_patterns.push(...findings.safe_patterns);
      results.potential_leaks.push(...findings.potential_leaks);
      results.warnings.push(...findings.warnings);

      // Group by file
      if (!results.by_file[fn.filename]) {
        results.by_file[fn.filename] = {
          functions: [],
          acquisition_count: 0,
          release_count: 0,
          safe_pattern_count: 0,
          potential_leak_count: 0
        };
      }
      results.by_file[fn.filename].functions.push(fn.symbol);
      results.by_file[fn.filename].acquisition_count +=
        findings.acquisitions.length;
      results.by_file[fn.filename].release_count += findings.releases.length;
      results.by_file[fn.filename].safe_pattern_count +=
        findings.safe_patterns.length;
      results.by_file[fn.filename].potential_leak_count +=
        findings.potential_leaks.length;

      // Group by language
      if (!results.by_language[fn.language]) {
        results.by_language[fn.language] = {
          function_count: 0,
          acquisition_count: 0,
          release_count: 0,
          safe_pattern_count: 0,
          potential_leak_count: 0
        };
      }
      results.by_language[fn.language].function_count++;
      results.by_language[fn.language].acquisition_count +=
        findings.acquisitions.length;
      results.by_language[fn.language].release_count +=
        findings.releases.length;
      results.by_language[fn.language].safe_pattern_count +=
        findings.safe_patterns.length;
      results.by_language[fn.language].potential_leak_count +=
        findings.potential_leaks.length;

      // Group by category
      for (const acq of findings.acquisitions) {
        if (!results.by_category[acq.category]) {
          results.by_category[acq.category] = {
            acquisitions: [],
            releases: [],
            potential_leaks: []
          };
        }
        results.by_category[acq.category].acquisitions.push(acq);
      }
      for (const rel of findings.releases) {
        if (!results.by_category[rel.category]) {
          results.by_category[rel.category] = {
            acquisitions: [],
            releases: [],
            potential_leaks: []
          };
        }
        results.by_category[rel.category].releases.push(rel);
      }
      for (const leak of findings.potential_leaks) {
        if (!results.by_category[leak.category]) {
          results.by_category[leak.category] = {
            acquisitions: [],
            releases: [],
            potential_leaks: []
          };
        }
        results.by_category[leak.category].potential_leaks.push(leak);
      }
    }
  }

  // Calculate summary
  results.summary = {
    functions_analyzed: functions.length,
    functions_with_resources: results.functions_with_resources.length,
    resource_percentage:
      functions.length > 0
        ? Math.round(
            (results.functions_with_resources.length / functions.length) *
              100 *
              10
          ) / 10
        : 0,
    total_acquisitions: results.acquisitions.length,
    total_releases: results.releases.length,
    total_safe_patterns: results.safe_patterns.length,
    total_potential_leaks: results.potential_leaks.length,
    total_warnings: results.warnings.length,
    files_with_resources: Object.keys(results.by_file).length,
    languages: Object.keys(results.by_language),
    categories: Object.keys(results.by_category)
  };

  // Group patterns by name for easier analysis
  const group_by_name = (patterns) => {
    const grouped = {};
    for (const p of patterns) {
      if (!grouped[p.name]) {
        grouped[p.name] = {
          name: p.name,
          category: p.category,
          description: p.description,
          count: 0,
          locations: []
        };
      }
      grouped[p.name].count++;
      grouped[p.name].locations.push({
        symbol: p.symbol,
        filename: p.filename,
        line: p.start_line
      });
    }
    return Object.values(grouped).sort((a, b) => b.count - a.count);
  };

  results.acquisitions_grouped = group_by_name(results.acquisitions);
  results.releases_grouped = group_by_name(results.releases);
  results.safe_patterns_grouped = group_by_name(results.safe_patterns);
  results.potential_leaks_grouped = group_by_name(results.potential_leaks);

  return results;
};

export {
  analyze_project_resources,
  analyze_function_resources,
  RESOURCE_PATTERNS
};
