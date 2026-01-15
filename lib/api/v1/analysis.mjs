'use strict';

/**
 * @fileoverview Analysis API routes.
 * Provides endpoints for static code analysis features.
 * @module lib/api/v1/analysis
 */

import { get_project_by_name } from '../../model/project.mjs';
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
  analyze_project_readability_score
} from '../../analysis.mjs';

/**
 * Helper to get project ID from name.
 * @param {string} name - Project name
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<number|Object>} Project ID or error response
 */
const getProjectId = async (name, h) => {
  const projects = await get_project_by_name({ name });
  if (projects.length === 0) {
    return h.response({ error: `Project '${name}' not found` }).code(404);
  }
  return projects[0].id;
};

// Dashboard - combined analysis overview
const dashboard = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await get_analysis_dashboard(projectId);
    return result;
  }
};

// Dead code detection
const deadCode = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/dead-code',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await detect_dead_code(projectId);
    return result;
  }
};

// Code duplication detection
const duplication = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/duplication',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const threshold = parseFloat(request.query.threshold) || 0.7;
    const result = await detect_code_duplication(projectId, threshold);
    return result;
  }
};

// Dependency analysis
const dependencies = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/dependencies',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await analyze_dependencies(projectId);
    return result;
  }
};

// Security vulnerability detection
const security = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/security',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await detect_security_vulnerabilities(projectId);
    return result;
  }
};

// Code metrics
const metrics = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/metrics',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await get_code_metrics(projectId);
    return result;
  }
};

// Code smell detection
const codeSmells = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/code-smells',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await detect_code_smells(projectId);
    return result;
  }
};

// Type analysis
const types = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/types',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await analyze_types(projectId);
    return result;
  }
};

// API surface analysis
const apiSurface = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/api-surface',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await analyze_api_surface(projectId);
    return result;
  }
};

// Documentation coverage
const documentation = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/documentation',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await analyze_documentation(projectId);
    return result;
  }
};

// Variable scope analysis
const scope = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/scope',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await analyze_variable_scope(projectId);
    return result;
  }
};

// Cross-reference: Find all references to a symbol
const references = {
  method: 'GET',
  path: '/api/v1/projects/{name}/references/{symbol}',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const options = {
      filename: request.query.filename,
      definitions_only: request.query.definitions_only === 'true'
    };

    const result = await find_all_references(projectId, request.params.symbol, options);
    return result;
  }
};

// Cross-reference: Go to definition
const definition = {
  method: 'GET',
  path: '/api/v1/projects/{name}/definition/{symbol}',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const context = {
      filename: request.query.filename,
      line: request.query.line ? parseInt(request.query.line) : undefined
    };

    const result = await go_to_definition(projectId, request.params.symbol, context);
    return result;
  }
};

// Cross-reference: List all definitions
const definitions = {
  method: 'GET',
  path: '/api/v1/projects/{name}/definitions',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const options = {
      symbol_type: request.query.type
    };

    const result = await list_definitions(projectId, options);
    return result;
  }
};

// Cross-reference: Symbol reference summary
const referenceSummary = {
  method: 'GET',
  path: '/api/v1/projects/{name}/references-summary',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await get_symbol_reference_summary(projectId);
    return result;
  }
};

// Cross-reference: Symbols at location
const symbolsAtLocation = {
  method: 'GET',
  path: '/api/v1/projects/{name}/symbols-at',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const { filename, line, column } = request.query;
    if (!filename || !line) {
      return h.response({ error: 'filename and line parameters are required' }).code(400);
    }

    const result = await find_symbols_at_location(
      projectId,
      filename,
      parseInt(line),
      column ? parseInt(column) : undefined
    );
    return result;
  }
};

// Class hierarchy: Get hierarchy tree for a class
const classHierarchy = {
  method: 'GET',
  path: '/api/v1/projects/{name}/hierarchy/{symbol}',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const { symbol } = request.params;
    const { direction, max_depth } = request.query;

    const result = await get_class_hierarchy(projectId, symbol, {
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
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const { symbol } = request.params;
    const result = await find_implementations(projectId, symbol);
    return result;
  }
};

// Class hierarchy: Analyze full project hierarchy
const hierarchyAnalysis = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/hierarchy',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await analyze_class_hierarchy(projectId);
    return result;
  }
};

// Concurrency analysis
const concurrency = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/concurrency',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await analyze_project_concurrency(projectId);
    return result;
  }
};

// Resource analysis
const resources = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/resources',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await analyze_project_resources(projectId);
    return result;
  }
};

// Naming convention analysis
const naming = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/naming',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await analyze_project_naming_conventions(projectId);
    return result;
  }
};

// Readability score analysis
const readability = {
  method: 'GET',
  path: '/api/v1/projects/{name}/analysis/readability',
  handler: async (request, h) => {
    const projectId = await getProjectId(request.params.name, h);
    if (typeof projectId !== 'number') return projectId;

    const result = await analyze_project_readability_score(projectId);
    return result;
  }
};

/** @type {Object[]} All analysis routes */
const analysis = [
  dashboard,
  deadCode,
  duplication,
  dependencies,
  security,
  metrics,
  codeSmells,
  types,
  apiSurface,
  documentation,
  scope,
  // Cross-reference routes
  references,
  definition,
  definitions,
  referenceSummary,
  symbolsAtLocation,
  // Class hierarchy routes
  classHierarchy,
  implementations,
  hierarchyAnalysis,
  // Concurrency analysis route
  concurrency,
  // Resource analysis route
  resources,
  // Naming convention analysis route
  naming,
  // Readability score analysis route
  readability
];

export { analysis };
