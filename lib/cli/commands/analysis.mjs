'use strict';

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

const help = `usage: cb analysis [<args>]

Provides code analysis tools for a project.

  * dashboard - Comprehensive analysis overview with health score
  * dead-code - Detect potentially unreferenced code
  * duplication - Detect code duplication
  * dependencies - Analyze file dependencies and circular dependencies
  * security - Detect potential security vulnerabilities
  * metrics - Code complexity metrics
  * smells - Detect code smells
  * types - Type coverage analysis
  * api - API surface analysis
  * docs - Documentation coverage
  * scope - Variable scope analysis
`;

const dashboard_help = `usage: cb analysis dashboard --project=<project_name>

Returns a comprehensive code analysis dashboard including health score
and summaries of all analysis types.

Arguments:

  * --project=[project] - Name of the project (required)
`;

const dead_code_help = `usage: cb analysis dead-code --project=<project_name>

Detect potentially dead (unreferenced) code in a project.

Arguments:

  * --project=[project] - Name of the project (required)
`;

const duplication_help = `usage: cb analysis duplication --project=<project_name> [--threshold=<threshold>]

Detect code duplication in a project.

Arguments:

  * --project=[project] - Name of the project (required)
  * --threshold=[threshold] - Similarity threshold 0.0-1.0 (default 0.7)
`;

const dependencies_help = `usage: cb analysis dependencies --project=<project_name>

Analyze file dependencies and detect circular dependencies.

Arguments:

  * --project=[project] - Name of the project (required)
`;

const security_help = `usage: cb analysis security --project=<project_name>

Detect potential security vulnerabilities in the code.

Arguments:

  * --project=[project] - Name of the project (required)
`;

const metrics_help = `usage: cb analysis metrics --project=<project_name>

Return code complexity metrics including cyclomatic complexity,
lines of code, and maintainability index.

Arguments:

  * --project=[project] - Name of the project (required)
`;

const smells_help = `usage: cb analysis smells --project=<project_name>

Detect code smells such as long methods, high complexity,
deep nesting, and long parameter lists.

Arguments:

  * --project=[project] - Name of the project (required)
`;

const types_help = `usage: cb analysis types --project=<project_name>

Analyze type coverage and identify functions without type hints
in dynamically-typed languages.

Arguments:

  * --project=[project] - Name of the project (required)
`;

const api_help = `usage: cb analysis api --project=<project_name>

Analyze the public API surface of a project, identifying public
vs private functions and entry points.

Arguments:

  * --project=[project] - Name of the project (required)
`;

const docs_help = `usage: cb analysis docs --project=<project_name>

Analyze documentation coverage, identifying undocumented functions.

Arguments:

  * --project=[project] - Name of the project (required)
`;

const scope_help = `usage: cb analysis scope --project=<project_name>

Analyze variable scope issues including global variable usage
and variable shadowing.

Arguments:

  * --project=[project] - Name of the project (required)
`;

// Helper to get project ID
const getProjectId = async (project) => {
  const projects = await get_project_by_name({ name: project });
  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }
  return projects[0].id;
};

const analysis_dashboard = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await get_analysis_dashboard(project_id);

  console.log(`\n=== Analysis Dashboard: ${project} ===\n`);
  console.log(`Health Score: ${result.healthScore}/100\n`);

  console.log('Summary:');
  console.log(`  Dead Code: ${result.deadCode?.count || 0} issues`);
  console.log(`  Duplications: ${result.duplication?.count || 0} found`);
  console.log(`  Security: ${result.security?.count || 0} vulnerabilities`);
  console.log(`  Code Smells: ${result.codeSmells?.count || 0} detected`);
  console.log(`  Documentation: ${result.documentation?.coverage || 0}% coverage`);
};

const analysis_dead_code = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await detect_dead_code(project_id);

  console.log(`\n=== Dead Code Analysis: ${project} ===\n`);

  if (!result.deadCode || result.deadCode.length === 0) {
    console.log('No potentially dead code detected.');
    return;
  }

  console.log(`Found ${result.deadCode.length} potentially unreferenced functions:\n`);
  for (const item of result.deadCode) {
    console.log(`  * ${item.symbol} - ${item.filename}:${item.start_line}`);
  }
};

const analysis_duplication = async ({ project, threshold = 0.7 }) => {
  const project_id = await getProjectId(project);
  const result = await detect_code_duplication(project_id, threshold);

  console.log(`\n=== Code Duplication Analysis: ${project} ===\n`);
  console.log(`Threshold: ${threshold}\n`);

  if (!result.duplicates || result.duplicates.length === 0) {
    console.log('No code duplication detected.');
    return;
  }

  console.log(`Found ${result.duplicates.length} duplicate pairs:\n`);
  for (const dup of result.duplicates) {
    console.log(`  Similarity: ${(dup.similarity * 100).toFixed(1)}%`);
    console.log(`    - ${dup.func1.symbol} (${dup.func1.filename}:${dup.func1.start_line})`);
    console.log(`    - ${dup.func2.symbol} (${dup.func2.filename}:${dup.func2.start_line})`);
    console.log();
  }
};

const analysis_dependencies = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await analyze_dependencies(project_id);

  console.log(`\n=== Dependency Analysis: ${project} ===\n`);

  if (result.circularDependencies && result.circularDependencies.length > 0) {
    console.log(`Circular Dependencies (${result.circularDependencies.length}):\n`);
    for (const cycle of result.circularDependencies) {
      console.log(`  * ${cycle.join(' -> ')}`);
    }
    console.log();
  } else {
    console.log('No circular dependencies detected.\n');
  }

  if (result.dependencies) {
    console.log(`File Dependencies:\n`);
    for (const [file, deps] of Object.entries(result.dependencies)) {
      if (deps.length > 0) {
        console.log(`  ${file}:`);
        for (const dep of deps) {
          console.log(`    -> ${dep}`);
        }
      }
    }
  }
};

const analysis_security = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await detect_security_vulnerabilities(project_id);

  console.log(`\n=== Security Analysis: ${project} ===\n`);

  if (!result.vulnerabilities || result.vulnerabilities.length === 0) {
    console.log('No potential security vulnerabilities detected.');
    return;
  }

  console.log(`Found ${result.vulnerabilities.length} potential vulnerabilities:\n`);
  for (const vuln of result.vulnerabilities) {
    console.log(`  [${vuln.severity}] ${vuln.type}`);
    console.log(`    ${vuln.symbol} - ${vuln.filename}:${vuln.line}`);
    console.log(`    ${vuln.description}\n`);
  }
};

const analysis_metrics = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await get_code_metrics(project_id);

  console.log(`\n=== Code Metrics: ${project} ===\n`);

  if (result.summary) {
    console.log('Summary:');
    console.log(`  Total Functions: ${result.summary.totalFunctions || 0}`);
    console.log(`  Total Lines: ${result.summary.totalLines || 0}`);
    console.log(`  Average Complexity: ${(result.summary.avgComplexity || 0).toFixed(2)}`);
    console.log(`  Average Lines/Function: ${(result.summary.avgLinesPerFunction || 0).toFixed(1)}`);
    console.log();
  }

  if (result.highComplexity && result.highComplexity.length > 0) {
    console.log('High Complexity Functions:\n');
    for (const func of result.highComplexity) {
      console.log(`  * ${func.symbol} (complexity: ${func.complexity}) - ${func.filename}:${func.start_line}`);
    }
  }
};

const analysis_smells = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await detect_code_smells(project_id);

  console.log(`\n=== Code Smells: ${project} ===\n`);

  if (!result.smells || result.smells.length === 0) {
    console.log('No code smells detected.');
    return;
  }

  // Group by type
  const grouped = {};
  for (const smell of result.smells) {
    if (!grouped[smell.type]) {
      grouped[smell.type] = [];
    }
    grouped[smell.type].push(smell);
  }

  for (const [type, smells] of Object.entries(grouped)) {
    console.log(`${type} (${smells.length}):\n`);
    for (const smell of smells) {
      console.log(`  * ${smell.symbol} - ${smell.filename}:${smell.start_line}`);
      if (smell.details) {
        console.log(`    ${smell.details}`);
      }
    }
    console.log();
  }
};

const analysis_types = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await analyze_types(project_id);

  console.log(`\n=== Type Coverage Analysis: ${project} ===\n`);

  if (result.summary) {
    console.log('Summary:');
    console.log(`  Total Functions: ${result.summary.total || 0}`);
    console.log(`  With Type Hints: ${result.summary.typed || 0}`);
    console.log(`  Without Type Hints: ${result.summary.untyped || 0}`);
    console.log(`  Coverage: ${(result.summary.coverage || 0).toFixed(1)}%`);
    console.log();
  }

  if (result.untyped && result.untyped.length > 0) {
    console.log('Functions Without Type Hints:\n');
    for (const func of result.untyped.slice(0, 20)) {
      console.log(`  * ${func.symbol} - ${func.filename}:${func.start_line}`);
    }
    if (result.untyped.length > 20) {
      console.log(`  ... and ${result.untyped.length - 20} more`);
    }
  }
};

const analysis_api = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await analyze_api_surface(project_id);

  console.log(`\n=== API Surface Analysis: ${project} ===\n`);

  if (result.summary) {
    console.log('Summary:');
    console.log(`  Total Functions: ${result.summary.total || 0}`);
    console.log(`  Public: ${result.summary.public || 0}`);
    console.log(`  Private: ${result.summary.private || 0}`);
    console.log(`  Entry Points: ${result.summary.entryPoints || 0}`);
    console.log();
  }

  if (result.entryPoints && result.entryPoints.length > 0) {
    console.log('Entry Points:\n');
    for (const func of result.entryPoints) {
      console.log(`  * ${func.symbol} - ${func.filename}:${func.start_line}`);
    }
  }
};

const analysis_docs = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await analyze_documentation(project_id);

  console.log(`\n=== Documentation Coverage: ${project} ===\n`);

  if (result.summary) {
    console.log('Summary:');
    console.log(`  Total Functions: ${result.summary.total || 0}`);
    console.log(`  Documented: ${result.summary.documented || 0}`);
    console.log(`  Undocumented: ${result.summary.undocumented || 0}`);
    console.log(`  Coverage: ${(result.summary.coverage || 0).toFixed(1)}%`);
    console.log();
  }

  if (result.undocumented && result.undocumented.length > 0) {
    console.log('Undocumented Functions:\n');
    for (const func of result.undocumented.slice(0, 20)) {
      console.log(`  * ${func.symbol} - ${func.filename}:${func.start_line}`);
    }
    if (result.undocumented.length > 20) {
      console.log(`  ... and ${result.undocumented.length - 20} more`);
    }
  }
};

const analysis_scope = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await analyze_variable_scope(project_id);

  console.log(`\n=== Variable Scope Analysis: ${project} ===\n`);

  if (result.globals && result.globals.length > 0) {
    console.log(`Global Variables (${result.globals.length}):\n`);
    for (const g of result.globals.slice(0, 20)) {
      console.log(`  * ${g.name} - ${g.filename}:${g.line}`);
    }
    if (result.globals.length > 20) {
      console.log(`  ... and ${result.globals.length - 20} more`);
    }
    console.log();
  }

  if (result.shadowing && result.shadowing.length > 0) {
    console.log(`Variable Shadowing (${result.shadowing.length}):\n`);
    for (const s of result.shadowing) {
      console.log(`  * ${s.variable} in ${s.function} - ${s.filename}:${s.line}`);
    }
  }

  if ((!result.globals || result.globals.length === 0) &&
      (!result.shadowing || result.shadowing.length === 0)) {
    console.log('No scope issues detected.');
  }
};

const analysis = {
  command: 'analysis',
  description: 'Code analysis tools',
  commands: {
    dashboard: analysis_dashboard,
    'dead-code': analysis_dead_code,
    duplication: analysis_duplication,
    dependencies: analysis_dependencies,
    security: analysis_security,
    metrics: analysis_metrics,
    smells: analysis_smells,
    types: analysis_types,
    api: analysis_api,
    docs: analysis_docs,
    scope: analysis_scope
  },
  help,
  command_help: {
    dashboard: dashboard_help,
    'dead-code': dead_code_help,
    duplication: duplication_help,
    dependencies: dependencies_help,
    security: security_help,
    metrics: metrics_help,
    smells: smells_help,
    types: types_help,
    api: api_help,
    docs: docs_help,
    scope: scope_help
  },
  command_arguments: {
    dashboard: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    'dead-code': {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    duplication: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      threshold: {
        type: 'number',
        description: 'Similarity threshold 0.0-1.0 (default 0.7)'
      }
    },
    dependencies: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    security: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    metrics: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    smells: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    types: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    api: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    docs: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    scope: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    }
  }
};

export { analysis };
