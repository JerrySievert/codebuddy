'use strict';

/**
 * @fileoverview MCP tool handlers for code analysis operations.
 * @module lib/mcp/tools/analysis
 */

import { z } from 'zod';
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
  analyze_project_concurrency,
  analyze_project_resources,
  analyze_project_naming_conventions,
  analyze_project_readability_score,
  analyze_project_design_patterns,
  analyze_project_test_coverage
} from '../../analysis/index.mjs';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets project ID from project name.
 * @param {string} project_name - Project name
 * @returns {Promise<number>} Project ID
 * @throws {Error} If project not found
 */
const get_project_id = async (project_name) => {
  const projects = await get_project_by_name({ name: project_name });
  if (projects.length === 0) {
    throw new Error(`Project '${project_name}' not found`);
  }
  return projects[0].id;
};

// =============================================================================
// Handler Functions (testable independently)
// =============================================================================

/**
 * Returns a comprehensive analysis dashboard for a project.
 * @param {Object} params - Parameters
 * @param {string} params.project_name - Project name
 * @returns {Promise<Object>} MCP response with dashboard data
 */
export const analysis_dashboard_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await get_analysis_dashboard(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Detects dead (unreferenced) code in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with dead code list
 */
export const analysis_dead_code_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await detect_dead_code(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Detects code duplication in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @param {number} [params.threshold=0.7] - Similarity threshold (0.0-1.0)
 * @returns {Promise<Object>} MCP response with duplication groups
 */
export const analysis_duplication_handler = async ({
  project_name,
  threshold = 0.7
}) => {
  const project_id = await get_project_id(project_name);
  const result = await detect_code_duplication(project_id, threshold || 0.7);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Analyzes file dependencies in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with dependency analysis
 */
export const analysis_dependencies_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_dependencies(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Detects potential security vulnerabilities in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with security vulnerabilities
 */
export const analysis_security_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await detect_security_vulnerabilities(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Calculates aggregate code metrics for a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with code metrics
 */
export const analysis_metrics_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await get_code_metrics(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Detects code smells in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with code smells
 */
export const analysis_code_smells_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await detect_code_smells(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Analyzes type usage in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with type analysis
 */
export const analysis_types_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_types(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Analyzes the public API surface of a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with API surface analysis
 */
export const analysis_api_surface_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_api_surface(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Analyzes documentation coverage in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with documentation analysis
 */
export const analysis_documentation_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_documentation(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Analyzes variable scope issues in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with scope analysis
 */
export const analysis_scope_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_variable_scope(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Analyzes concurrency patterns in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with concurrency analysis
 */
export const analysis_concurrency_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_project_concurrency(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Analyzes memory and resource management patterns in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with resource analysis
 */
export const analysis_resources_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_project_resources(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Analyzes naming conventions in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with naming analysis
 */
export const analysis_naming_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_project_naming_conventions(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Calculates readability scores for code in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with readability analysis
 */
export const analysis_readability_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_project_readability_score(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Detects design patterns used in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with pattern analysis
 */
export const analysis_patterns_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_project_design_patterns(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

/**
 * Analyzes test coverage and quality in a project.
 * @param {Object} params - Parameters
 * @param {string} params.project - Project name
 * @returns {Promise<Object>} MCP response with test analysis
 */
export const analysis_tests_handler = async ({ project_name }) => {
  const project_id = await get_project_id(project_name);
  const result = await analyze_project_test_coverage(project_id);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }]
  };
};

// =============================================================================
// Tool Definitions (for registration)
// =============================================================================

export const analysis_tools = [
  {
    name: 'analysis_dashboard',
    description: `Returns a comprehensive analysis dashboard for a project with health scores and summaries of all analysis types including:
- Health score (0-100) and rating
- Dead code statistics
- Code duplication metrics
- Dependency analysis
- Security vulnerabilities count
- Code metrics and maintainability
- Code smells
- Type coverage
- API surface analysis
- Documentation coverage
- Variable scope issues

This is the best starting point for understanding overall code quality.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_dashboard_handler
  },
  {
    name: 'analysis_dead_code',
    description: `Detects dead code (unreferenced functions) in a project. A function is considered dead if:
- It has no callers (no other function calls it)
- It's not a likely entry point (main, init, handler, test, etc.)

Returns list of potentially dead functions with their locations and line counts, sorted by size. Useful for identifying code that can be safely removed.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_dead_code_handler
  },
  {
    name: 'analysis_duplication',
    description: `Detects code duplication in a project by finding functions with similar structure. Uses AST-based similarity comparison.

The threshold parameter (0.0-1.0) controls how similar functions must be to be considered duplicates:
- 0.7 (default): Moderate similarity, catches most duplicates
- 0.8+: High similarity, only very similar code
- 0.5-0.7: Loose similarity, may include false positives

Returns groups of similar functions that could potentially be refactored.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        ),
      threshold: z
        .number()
        .optional()
        .default(0.7)
        .describe('Similarity threshold (0.0-1.0, default 0.7)')
    },
    handler: analysis_duplication_handler
  },
  {
    name: 'analysis_dependencies',
    description: `Analyzes file dependencies in a project. Shows:
- Import/include relationships between files
- Circular dependencies (files that depend on each other)
- Dependency graph metrics
- Most depended-upon files (high fan-in)
- Files with most dependencies (high fan-out)

Circular dependencies are often a sign of poor architecture and can cause issues.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_dependencies_handler
  },
  {
    name: 'analysis_security',
    description: `Detects potential security vulnerabilities in the code including:
- SQL injection risks
- Command injection risks
- Cross-site scripting (XSS) vulnerabilities
- Hardcoded credentials/secrets
- Insecure cryptographic usage
- Path traversal vulnerabilities
- Unsafe deserialization

Returns vulnerabilities categorized by severity (high, medium, low) with locations and descriptions.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_security_handler
  },
  {
    name: 'analysis_metrics',
    description: `Calculates aggregate code metrics for a project including:
- Total functions and lines of code
- Average/max cyclomatic complexity
- Average/max function length
- Average/max nesting depth
- Maintainability index (0-100 scale)
- Maintainability rating (A-F)

The maintainability index combines complexity, size, and documentation metrics into a single score.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_metrics_handler
  },
  {
    name: 'analysis_code_smells',
    description: `Detects code smells - patterns that indicate potential problems:
- Long methods (functions with too many lines)
- God functions (functions that do too much)
- Long parameter lists
- Deep nesting
- Feature envy (functions that use other classes more than their own)
- Data clumps (groups of data that appear together)

Returns smells with severity, location, and refactoring suggestions.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_code_smells_handler
  },
  {
    name: 'analysis_types',
    description: `Analyzes type usage in a project:
- Functions with type annotations vs without
- Type coverage percentage
- Most common types used
- Functions that could benefit from type annotations

Useful for gradually typed languages like Python and JavaScript/TypeScript.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_types_handler
  },
  {
    name: 'analysis_api_surface',
    description: `Analyzes the public API surface of a project:
- Public vs private functions
- Exported symbols
- Entry points
- Documentation coverage for public APIs

Helps understand what interfaces a library/module exposes.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_api_surface_handler
  },
  {
    name: 'analysis_documentation',
    description: `Analyzes documentation coverage in a project:
- Functions with docstrings/comments vs without
- Documentation coverage percentage
- Quality of existing documentation
- Functions most in need of documentation (complex but undocumented)

Good documentation improves maintainability and helps onboarding.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_documentation_handler
  },
  {
    name: 'analysis_scope',
    description: `Analyzes variable scope issues in a project:
- Global variables that could be local
- Variable shadowing (inner scope redefines outer variable)
- Unused variables
- Variables with too wide a scope

Proper scoping reduces bugs and improves code clarity.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_scope_handler
  },
  {
    name: 'analysis_concurrency',
    description:
      'Analyzes concurrency patterns in a project. Detects async/await, threads, locks, synchronization primitives, and potential race conditions.',
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_concurrency_handler
  },
  {
    name: 'analysis_resources',
    description:
      'Analyzes memory and resource management patterns in a project. Detects resource acquisition/release, smart pointers, RAII patterns, and potential resource leaks.',
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_resources_handler
  },
  {
    name: 'analysis_naming',
    description: `Analyzes naming conventions in a project:
- Detects naming style (camelCase, snake_case, PascalCase, etc.)
- Identifies inconsistent naming
- Flags names that are too short or unclear
- Suggests naming improvements

Consistent naming improves code readability.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_naming_handler
  },
  {
    name: 'analysis_readability',
    description: `Calculates readability scores for code in a project:
- Function-level readability scores
- Factors affecting readability (length, complexity, naming, etc.)
- Most and least readable functions
- Suggestions for improving readability

Readable code is easier to maintain and has fewer bugs.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_readability_handler
  },
  {
    name: 'analysis_patterns',
    description: `Detects design patterns used in a project:
- Creational patterns (Factory, Singleton, Builder, etc.)
- Structural patterns (Adapter, Decorator, Facade, etc.)
- Behavioral patterns (Observer, Strategy, Command, etc.)

Understanding patterns helps comprehend code architecture.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_patterns_handler
  },
  {
    name: 'analysis_tests',
    description: `Analyzes test coverage and quality in a project:
- Test files and test functions found
- Functions with tests vs without
- Test-to-code ratio
- Test naming conventions
- Identifies untested critical functions

Good test coverage reduces bugs and enables safe refactoring.`,
    schema: {
      project_name: z
        .string()
        .describe(
          'The name of the project to analyze (use project_list to see available projects)'
        )
    },
    handler: analysis_tests_handler
  }
];
