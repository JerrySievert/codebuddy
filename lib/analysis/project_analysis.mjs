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
  detect_security_vulnerabilities,
  detect_code_smells,
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

  // Run actual analysis functions in parallel to get accurate counts
  const [
    dead_code_result,
    security_result,
    code_smells_result,
    types_result,
    documentation_result,
    scope_result,
    file_count,
    circular_deps
  ] = await Promise.all([
    detect_dead_code(project_id),
    detect_security_vulnerabilities(project_id),
    detect_code_smells(project_id),
    analyze_types(project_id),
    analyze_documentation(project_id),
    analyze_variable_scope(project_id),
    // File count
    query`
      SELECT COUNT(DISTINCT filename) as count
      FROM entity WHERE project_id = ${project_id}
    `,
    // Circular dependency check (simplified)
    query`
      SELECT COUNT(*) as count FROM (
        SELECT DISTINCT caller_e.filename
        FROM relationship r
        JOIN entity caller_e ON r.caller = caller_e.id
        JOIN entity callee_e ON r.callee = callee_e.id
        WHERE caller_e.project_id = ${project_id}
          AND callee_e.project_id = ${project_id}
          AND caller_e.filename != callee_e.filename
          AND EXISTS (
            SELECT 1 FROM relationship r2
            JOIN entity c1 ON r2.caller = c1.id
            JOIN entity c2 ON r2.callee = c2.id
            WHERE c1.filename = callee_e.filename
              AND c2.filename = caller_e.filename
              AND c1.project_id = ${project_id}
          )
        LIMIT 10
      ) circular
    `
  ]);

  const total_files = parseInt(file_count[0]?.count || 0);
  const circular_count = parseInt(circular_deps[0]?.count || 0);

  // Extract summary data from actual analysis results
  const total_functions = code_smells_result.summary?.total_functions || 0;
  const maintainability_index = code_smells_result.maintainability_index || 70;
  const maintainability_rating =
    code_smells_result.maintainability_rating || 'B';

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
    // Dependencies
    circular_dependency_count: circular_count,
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
 * Calculate and store file list with function counts for a project.
 * This caches the file listing to avoid slow GROUP BY queries on large projects.
 * @param {number} project_id - The project ID
 * @returns {Promise<Object[]>} Array of {filename, function_count} objects
 */
const calculate_and_store_files = async (project_id) => {
  console.log(`[ANALYSIS] Calculating file list for project ${project_id}...`);
  const start_time = Date.now();

  const files = await query`
    SELECT filename,
           COUNT(id) AS function_count
      FROM entity
     WHERE type = 'function'
       AND project_id = ${project_id}
     GROUP BY filename
     ORDER BY filename ASC
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
    // Run complexity, dashboard, and file list calculations in parallel
    await Promise.all([
      calculate_and_store_complexity(project_id),
      calculate_and_store_dashboard(project_id),
      calculate_and_store_files(project_id)
    ]);

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
  calculate_and_store_dashboard,
  calculate_and_store_files,
  run_all_precalculations
};
