'use strict';

/**
 * @fileoverview File analytics API route.
 * Returns analytics/complexity metrics for all entities in a specific file.
 * @module lib/api/v1/files/analytics
 */

import { get_project_by_name } from '../../../model/project.mjs';
import { get_entity } from '../../../model/entity.mjs';
import { calculate_complexity } from '../../../complexity.mjs';

/**
 * Handler for GET /api/v1/files/analytics - get file-level analytics.
 * @param {Object} request - Hapi request object
 * @param {Object} request.query - Query parameters
 * @param {string} request.query.project - Project name (required)
 * @param {string} request.query.filename - Filename to analyze (required)
 * @param {Object} h - Hapi response toolkit
 * @returns {Promise<Object>} File analytics with aggregated metrics
 */
const analytics_handler = async (request, h) => {
  const { project, filename } = request.query;

  if (!project || !filename) {
    return h
      .response({ error: 'Both project and filename parameters are required' })
      .code(400);
  }

  const projects = await get_project_by_name({ name: project });
  if (projects.length === 0) {
    return h.response({ error: `Project '${project}' not found` }).code(404);
  }

  const project_id = projects[0].id;

  // Get all entities in this file
  const entities = await get_entity({
    project_id,
    filename
  });

  if (entities.length === 0) {
    return {
      filename,
      project,
      entity_count: 0,
      entities_by_type: {},
      complexity: null
    };
  }

  // Calculate complexity for each entity and aggregate
  const entitiesWithComplexity = entities.map((entity) => ({
    ...entity,
    complexity: calculate_complexity(entity)
  }));

  // Count entities by type
  const entities_by_type = {};
  for (const entity of entities) {
    entities_by_type[entity.type] = (entities_by_type[entity.type] || 0) + 1;
  }

  // Aggregate complexity metrics (only for entities with source code)
  const functionsWithComplexity = entitiesWithComplexity.filter(
    (e) => e.complexity && e.type === 'function'
  );

  let complexity = null;
  if (functionsWithComplexity.length > 0) {
    const cyclomatics = functionsWithComplexity.map(
      (e) => e.complexity.cyclomatic
    );
    const locs = functionsWithComplexity.map((e) => e.complexity.loc);
    const nestingDepths = functionsWithComplexity.map(
      (e) => e.complexity.nesting_depth
    );
    const paramCounts = functionsWithComplexity.map(
      (e) => e.complexity.parameter_count
    );

    complexity = {
      total_functions: functionsWithComplexity.length,
      total_loc: locs.reduce((a, b) => a + b, 0),
      avg_cyclomatic: (
        cyclomatics.reduce((a, b) => a + b, 0) / cyclomatics.length
      ).toFixed(2),
      max_cyclomatic: Math.max(...cyclomatics),
      min_cyclomatic: Math.min(...cyclomatics),
      avg_loc: (locs.reduce((a, b) => a + b, 0) / locs.length).toFixed(1),
      max_loc: Math.max(...locs),
      avg_nesting_depth: (
        nestingDepths.reduce((a, b) => a + b, 0) / nestingDepths.length
      ).toFixed(2),
      max_nesting_depth: Math.max(...nestingDepths),
      avg_parameters: (
        paramCounts.reduce((a, b) => a + b, 0) / paramCounts.length
      ).toFixed(1),
      max_parameters: Math.max(...paramCounts)
    };
  }

  // Find most complex functions
  const topComplex = functionsWithComplexity
    .sort((a, b) => b.complexity.cyclomatic - a.complexity.cyclomatic)
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      symbol: e.symbol,
      start_line: e.start_line,
      complexity: e.complexity
    }));

  return {
    filename,
    project,
    entity_count: entities.length,
    entities_by_type,
    complexity,
    top_complex: topComplex
  };
};

const analytics = {
  method: 'GET',
  path: '/api/v1/files/analytics',
  handler: analytics_handler
};

export { analytics };
