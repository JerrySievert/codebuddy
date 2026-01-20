'use strict';

/**
 * @fileoverview Project analysis pre-calculation module.
 * Calculates and caches complexity and other analysis metrics for projects.
 * @module lib/project_analysis
 */

import { query } from '../db.mjs';
import { calculate_aggregate_complexity } from './complexity.mjs';
import { upsert_project_analysis } from '../model/project_analysis.mjs';
import {
  detect_dead_code,
  detect_code_duplication,
  detect_security_vulnerabilities,
  detect_code_smells,
  get_code_metrics,
  analyze_dependencies,
  analyze_types,
  analyze_documentation,
  analyze_variable_scope
} from './index.mjs';

/**
 * Calculate and store complexity metrics for a project.
 * Uses an optimized query that only fetches the columns needed for complexity calculation.
 * @param {number} project_id - The project ID
 * @returns {Promise<Object>} The calculated complexity metrics
 */
const calculate_and_store_complexity = async (project_id) => {
  console.log(`[ANALYSIS] Calculating complexity for project ${project_id}...`);
  const start_time = Date.now();

  // Optimized query: only fetch columns needed for complexity calculation
  // This is much faster than SELECT * which includes full source code
  const functions = await query`
    SELECT id, source, parameters, language
    FROM entity
    WHERE project_id = ${project_id} AND type = 'function'
  `;

  const complexity = calculate_aggregate_complexity(functions);

  // Store in database
  await upsert_project_analysis({
    project_id,
    analysis_type: 'complexity',
    data: complexity
  });

  console.log(
    `[ANALYSIS] Complexity calculation complete: ${Date.now() - start_time}ms (${functions.length} functions)`
  );

  return complexity;
};

/**
 * Calculate and store basic analysis dashboard metrics for a project.
 * Uses the actual analysis functions to ensure counts match detail views.
 * @param {number} project_id - The project ID
 * @returns {Promise<Object>} The calculated dashboard metrics
 */
const calculate_and_store_dashboard = async (project_id) => {
  console.log(
    `[ANALYSIS] Calculating dashboard metrics for project ${project_id}...`
  );
  const start_time = Date.now();

  // Run analysis functions sequentially to avoid database contention
  const dead_code_result = await detect_dead_code(project_id);
  const dependencies_result = await analyze_dependencies(project_id);
  const security_result = await detect_security_vulnerabilities(project_id);
  const code_smells_result = await detect_code_smells(project_id);
  const metrics_result = await get_code_metrics(project_id);
  const types_result = await analyze_types(project_id);
  const documentation_result = await analyze_documentation(project_id);
  const scope_result = await analyze_variable_scope(project_id);
  const file_count = await query`
    SELECT COUNT(DISTINCT filename) as count
    FROM entity WHERE project_id = ${project_id}
  `;

  // Get cached duplication data (computed earlier in run_all_precalculations)
  const { get_project_analysis } = await import(
    '../model/project_analysis.mjs'
  );
  const cached_duplication = await get_project_analysis({
    project_id,
    analysis_type: 'duplication'
  });
  const duplication_result = cached_duplication?.data || { summary: {} };

  const total_files = parseInt(file_count[0]?.count || 0);

  // Extract summary data from actual analysis results
  const total_functions = code_smells_result.summary?.total_functions || 0;
  const maintainability_index = metrics_result.maintainability_index || 70;
  const maintainability_rating =
    metrics_result.maintainability_rating || 'Medium';

  const dashboard = {
    total_functions: total_functions,
    total_files: total_files,
    // Dead code - from actual analysis
    dead_function_count: dead_code_result.summary?.dead_function_count || 0,
    dead_code_percentage: dead_code_result.summary?.dead_code_percentage || 0,
    // Documentation - from actual analysis
    documented_count: documentation_result.summary?.fully_documented || 0,
    documentation_coverage:
      documentation_result.summary?.coverage_percentage || 0,
    // Dependencies - from actual analysis
    total_dependencies: dependencies_result.summary?.total_dependencies || 0,
    circular_dependency_count:
      dependencies_result.summary?.circular_dependency_count || 0,
    // Code duplication - from cached analysis
    duplicate_group_count:
      duplication_result.summary?.duplicate_group_count || 0,
    duplication_percentage:
      duplication_result.summary?.duplication_percentage || 0,
    // Code smells - from actual analysis
    code_smells_count: code_smells_result.summary?.total_smells || 0,
    // Security - from actual analysis
    security_issues_count: security_result.summary?.total_vulnerabilities || 0,
    security_high_severity: security_result.summary?.high_severity || 0,
    security_medium_severity: security_result.summary?.medium_severity || 0,
    security_low_severity: security_result.summary?.low_severity || 0,
    // Scope - from actual analysis
    scope_issues_count: scope_result.summary?.total_issues || 0,
    // Types - from actual analysis
    type_coverage_percentage:
      types_result.summary?.type_coverage_percentage || 0,
    // Code metrics - from actual analysis
    avg_cyclomatic: metrics_result.aggregate?.avg_cyclomatic || 0,
    max_cyclomatic: metrics_result.aggregate?.max_cyclomatic || 0,
    avg_loc: metrics_result.aggregate?.avg_loc || 0,
    max_loc: metrics_result.aggregate?.max_loc || 0,
    // Maintainability
    maintainability_index: maintainability_index,
    maintainability_rating: maintainability_rating
  };

  // Store in database
  await upsert_project_analysis({
    project_id,
    analysis_type: 'dashboard',
    data: dashboard
  });

  console.log(
    `[ANALYSIS] Dashboard metrics complete: ${Date.now() - start_time}ms`
  );

  return dashboard;
};

/**
 * Calculate and store code duplication analysis for a project.
 * This is O(n²) so it runs during import in a worker thread, not on-demand.
 * @param {number} project_id - The project ID
 * @returns {Promise<Object>} The duplication analysis results
 */
const calculate_and_store_duplication = async (project_id) => {
  console.log(
    `[ANALYSIS] Calculating code duplication for project ${project_id}...`
  );
  const start_time = Date.now();

  const duplication = await detect_code_duplication(project_id);

  // Store in database
  await upsert_project_analysis({
    project_id,
    analysis_type: 'duplication',
    data: duplication
  });

  console.log(
    `[ANALYSIS] Duplication analysis complete: ${Date.now() - start_time}ms (${duplication.summary?.duplicate_group_count || 0} groups found)`
  );

  return duplication;
};

/**
 * Calculate and store file list with function counts for a project.
 * This caches the file listing to avoid slow GROUP BY queries on large projects.
 * Includes all files from sourcecode table, not just those with functions.
 * @param {number} project_id - The project ID
 * @returns {Promise<Object[]>} Array of {filename, function_count} objects
 */
const calculate_and_store_files = async (project_id) => {
  console.log(`[ANALYSIS] Calculating file list for project ${project_id}...`);
  const start_time = Date.now();

  // Get all files from sourcecode table with entity counts
  // This includes non-code files (markdown, config, etc.) that have no entities
  const files = await query`
    SELECT s.filename,
           COUNT(e.id) AS function_count
      FROM sourcecode s
      LEFT JOIN entity e ON e.filename = s.filename
                        AND e.project_id = s.project_id
                        AND e.type = 'function'
     WHERE s.project_id = ${project_id}
     GROUP BY s.filename
     ORDER BY s.filename ASC
  `;

  // Store in database
  await upsert_project_analysis({
    project_id,
    analysis_type: 'files',
    data: files
  });

  console.log(
    `[ANALYSIS] File list complete: ${Date.now() - start_time}ms (${files.length} files)`
  );

  return files;
};

/**
 * Run all pre-calculations for a project after import/refresh.
 * @param {number} project_id - The project ID
 * @returns {Promise<void>}
 */
const run_all_precalculations = async (project_id) => {
  console.log(
    `[ANALYSIS] Running pre-calculations for project ${project_id}...`
  );
  const start_time = Date.now();

  try {
    // Run calculations sequentially to avoid database contention
    await calculate_and_store_complexity(project_id);
    await calculate_and_store_duplication(project_id);
    await calculate_and_store_dashboard(project_id);
    await calculate_and_store_files(project_id);

    console.log(
      `[ANALYSIS] All pre-calculations complete: ${Date.now() - start_time}ms`
    );
  } catch (error) {
    console.error(`[ANALYSIS] Pre-calculation failed:`, error.message);
    // Don't throw - pre-calculation failure shouldn't fail the import
  }
};

export {
  calculate_and_store_complexity,
  calculate_and_store_duplication,
  calculate_and_store_dashboard,
  calculate_and_store_files,
  run_all_precalculations
};
