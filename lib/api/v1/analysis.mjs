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
  get_analysis_dashboard
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
  scope
];

export { analysis };
