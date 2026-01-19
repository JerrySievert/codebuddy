'use strict';

/**
 * @fileoverview Analysis API routes.
 * Provides endpoints for static code analysis features.
 * @module lib/api/v1/analysis
 */

import { get_project_by_name } from '../../model/project.mjs';
import { get_project_analysis } from '../../model/project_analysis.mjs';
import { calculate_and_store_dashboard } from '../../analysis/project_analysis.mjs';
import {
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
  find_all_references,
  go_to_definition,
  list_definitions,
  get_symbol_reference_summary,
  find_symbols_at_location,
  get_class_hierarchy,
  find_implementations,
  analyze_class_hierarchy,
  analyze_project_concurrency,
  analyze_project_resources,
  analyze_project_naming_conventions,
  analyze_project_readability_score,
  analyze_project_design_patterns,
  analyze_project_test_coverage
} from '../../analysis/index.mjs';

/**
 * Helper to get project ID from name.
 * @param {string} name - Project name
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<number|Object>} Project ID or error response
 */
const get_project_id = async (name, h) => {
  const projects = await get_project_by_name({ name });
  if (projects.length === 0) {
    return h.response({ error: `Project '${name}' not found` }).code(404);
  }
  return projects[0].id;
};

/**
 * Format cached dashboard data into the expected API response format.
 * @param {Object} data - Cached dashboard data
 * @returns {Object} Formatted dashboard response
 */
const format_dashboard_response = (data) => {
  const health_score =
    data.maintainability_index ||
    Math.round(
      (Math.max(0, 100 - (data.dead_code_percentage || 0) * 2) +
        (data.documentation_coverage || 0)) /
        2
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
        dead_function_count: data.dead_function_count || 0,
        dead_code_percentage: data.dead_code_percentage || 0,
        dead_lines_of_code: 0
      },
      duplication: {
        duplicate_group_count: 0,
        duplication_percentage: 0
      },
      dependencies: {
        total_files: data.total_files || 0,
        total_dependencies: 0,
        circular_dependency_count: data.circular_dependency_count || 0
      },
      security: {
        total_vulnerabilities: data.security_issues_count || 0,
        high_severity: data.security_high_severity || 0,
        medium_severity: data.security_medium_severity || 0,
        low_severity: data.security_low_severity || 0
      },
      metrics: {
        total_functions: data.total_functions || 0,
        maintainability_index: data.maintainability_index || 70,
        maintainability_rating: data.maintainability_rating || 'B'
      },
      code_smells: {
        total_smells: data.code_smells_count || 0,
        smell_density: 0,
        god_functions: 0
      },
      types: {
        total_dynamic_functions: 0,
        with_type_hints: 0,
        type_coverage_percentage: data.type_coverage_percentage || 0
      },
      api_surface: {
        public_count: data.total_functions || 0,
        private_count: 0,
        documentation_coverage: data.documentation_coverage || 0
      },
      documentation: {
        coverage_percentage: data.documentation_coverage || 0,
        fully_documented: data.documented_count || 0,
        undocumented: (data.total_functions || 0) - (data.documented_count || 0)
      },
      scope: {
        total_issues: data.scope_issues_count || 0,
        global_variable_issues: data.scope_issues_count || 0,
        shadowing_issues: 0
      }
    }
  };
};

// Dashboard - combined analysis overview
const dashboard = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    // Try to get cached dashboard data first
    let cached_dashboard = await get_project_analysis({
      project_id: project_id,
      analysis_type: 'dashboard'
    });

    // If no cache, calculate and store it
    if (!cached_dashboard) {
      await calculate_and_store_dashboard(project_id);
      cached_dashboard = await get_project_analysis({
        project_id: project_id,
        analysis_type: 'dashboard'
      });
    }

    // Return formatted cached data if available
    if (cached_dashboard) {
      return format_dashboard_response(cached_dashboard.data);
    }

    // Ultimate fallback (shouldn't normally reach here)
    const result = await get_analysis_dashboard(project_id);
    return result;
  }
};

// Dead code detection
const dead_code = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/dead-code',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await detect_dead_code(project_id);
    return result;
  }
};

// Code duplication detection
const duplication = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/duplication',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const threshold = parseFloat(request.query.threshold) || 0.7;
    const result = await detect_code_duplication(project_id, threshold);
    return result;
  }
};

// Dependency analysis
const dependencies = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/dependencies',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_dependencies(project_id);
    return result;
  }
};

// Security vulnerability detection
const security = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/security',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await detect_security_vulnerabilities(project_id);
    return result;
  }
};

// Code metrics
const metrics = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/metrics',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await get_code_metrics(project_id);
    return result;
  }
};

// Code smell detection
const code_smells = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/code-smells',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await detect_code_smells(project_id);
    return result;
  }
};

// Type analysis
const types = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/types',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_types(project_id);
    return result;
  }
};

// API surface analysis
const api_surface = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/api-surface',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_api_surface(project_id);
    return result;
  }
};

// Documentation coverage
const documentation = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/documentation',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_documentation(project_id);
    return result;
  }
};

// Variable scope analysis
const scope = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/scope',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_variable_scope(project_id);
    return result;
  }
};

// Cross-reference: Find all references to a symbol
const references = {
  method: 'GET',
  path: '/api/v1/projects/{name}/references/{symbol}',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const options = {
      filename: request.query.filename,
      definitions_only: request.query.definitions_only === 'true'
    };

    const result = await find_all_references(
      project_id,
      request.params.symbol,
      options
    );
    return result;
  }
};

// Cross-reference: Go to definition
const definition = {
  method: 'GET',
  path: '/api/v1/projects/{name}/definition/{symbol}',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const context = {
      filename: request.query.filename,
      line: request.query.line ? parseInt(request.query.line) : undefined
    };

    const result = await go_to_definition(
      project_id,
      request.params.symbol,
      context
    );
    return result;
  }
};

// Cross-reference: List all definitions
const definitions = {
  method: 'GET',
  path: '/api/v1/projects/{name}/definitions',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const options = {
      symbol_type: request.query.type
    };

    const result = await list_definitions(project_id, options);
    return result;
  }
};

// Cross-reference: Symbol reference summary
const reference_summary = {
  method: 'GET',
  path: '/api/v1/projects/{name}/references-summary',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await get_symbol_reference_summary(project_id);
    return result;
  }
};

// Cross-reference: Symbols at location
const symbols_at_location = {
  method: 'GET',
  path: '/api/v1/projects/{name}/symbols-at',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const { filename, line, column } = request.query;
    if (!filename || !line) {
      return h
        .response({ error: 'filename and line parameters are required' })
        .code(400);
    }

    const result = await find_symbols_at_location(
      project_id,
      filename,
      parseInt(line),
      column ? parseInt(column) : undefined
    );
    return result;
  }
};

// Class hierarchy: Get hierarchy tree for a class
const class_hierarchy = {
  method: 'GET',
  path: '/api/v1/projects/{name}/hierarchy/{symbol}',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const { symbol } = request.params;
    const { direction, max_depth } = request.query;

    const result = await get_class_hierarchy(project_id, symbol, {
      direction: direction || 'both',
      max_depth: max_depth ? parseInt(max_depth) : 10
    });
    return result;
  }
};

// Class hierarchy: Find implementations of an interface/class
const implementations = {
  method: 'GET',
  path: '/api/v1/projects/{name}/implementations/{symbol}',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const { symbol } = request.params;
    const result = await find_implementations(project_id, symbol);
    return result;
  }
};

// Class hierarchy: Analyze full project hierarchy
const hierarchy_analysis = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/hierarchy',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_class_hierarchy(project_id);
    return result;
  }
};

// Concurrency analysis
const concurrency = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/concurrency',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_project_concurrency(project_id);
    return result;
  }
};

// Resource analysis
const resources = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/resources',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_project_resources(project_id);
    return result;
  }
};

// Naming convention analysis
const naming = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/naming',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_project_naming_conventions(project_id);
    return result;
  }
};

// Readability score analysis
const readability = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/readability',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_project_readability_score(project_id);
    return result;
  }
};

// Pattern detection analysis
const patterns = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/patterns',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_project_design_patterns(project_id);
    return result;
  }
};

// Test analysis
const tests = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/tests',
  handler: async (request, h) => {
    const project_id = await get_project_id(request.params.name, h);
    if (typeof project_id !== 'number') return project_id;

    const result = await analyze_project_test_coverage(project_id);
    return result;
  }
};

/** @type {Object[]} All analysis routes */
const analysis = [
  dashboard,
  dead_code,
  duplication,
  dependencies,
  security,
  metrics,
  code_smells,
  types,
  api_surface,
  documentation,
  scope,
  // Cross-reference routes
  references,
  definition,
  definitions,
  reference_summary,
  symbols_at_location,
  // Class hierarchy routes
  class_hierarchy,
  implementations,
  hierarchy_analysis,
  // Concurrency analysis route
  concurrency,
  // Resource analysis route
  resources,
  // Naming convention analysis route
  naming,
  // Readability score analysis route
  readability,
  // Pattern detection analysis route
  patterns,
  // Test analysis route
  tests
];

export { analysis };
