'use strict';

import { get_project_by_name } from '../../model/project.mjs';
import {
  find_all_references,
  go_to_definition,
  list_definitions,
  get_symbol_reference_summary,
  find_symbols_at_location
} from '../../analysis.mjs';

const help = `usage: cb reference [<args>]

Cross-reference browser for finding symbol usages and definitions.

  * find - Find all references to a symbol
  * definition - Go to the definition of a symbol
  * list - List all definitions in a project
  * summary - Show symbol reference summary
  * at - Find symbols at a specific location
`;

const find_help = `usage: cb reference find --project=<project> --symbol=<symbol> [--filename=<filename>] [--definitions-only]

Find all references to a symbol in a project.

Arguments:

  * --project=[project] - Name of the project (required)
  * --symbol=[symbol] - Symbol name to find references for (required)
  * --filename=[filename] - Filter by filename
  * --definitions-only - Only return definitions
`;

const definition_help = `usage: cb reference definition --project=<project> --symbol=<symbol> [--filename=<filename>] [--line=<line>]

Go to the definition of a symbol.

Arguments:

  * --project=[project] - Name of the project (required)
  * --symbol=[symbol] - Symbol name to find definition for (required)
  * --filename=[filename] - File where the reference is (for context)
  * --line=[line] - Line where the reference is (for context)
`;

const list_help = `usage: cb reference list --project=<project> [--type=<type>]

List all symbol definitions in a project.

Arguments:

  * --project=[project] - Name of the project (required)
  * --type=[type] - Filter by symbol type (function, class, variable, parameter, etc.)
`;

const summary_help = `usage: cb reference summary --project=<project>

Show a summary of symbol references in a project.

Arguments:

  * --project=[project] - Name of the project (required)
`;

const at_help = `usage: cb reference at --project=<project> --filename=<filename> --line=<line> [--column=<column>]

Find symbols at a specific location in a file.

Arguments:

  * --project=[project] - Name of the project (required)
  * --filename=[filename] - Filename (required)
  * --line=[line] - Line number (required)
  * --column=[column] - Column number for precise matching
`;

// Helper to get project ID
const getProjectId = async (project) => {
  const projects = await get_project_by_name({ name: project });
  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }
  return projects[0].id;
};

const reference_find = async ({ project, symbol, filename, 'definitions-only': definitionsOnly }) => {
  const project_id = await getProjectId(project);
  const result = await find_all_references(project_id, symbol, {
    filename,
    definitions_only: definitionsOnly
  });

  console.log(`\n=== References for '${symbol}' in ${project} ===\n`);
  console.log(`Total: ${result.summary.total_references} references in ${result.summary.file_count} files`);
  console.log(`Definitions: ${result.summary.definition_count}, Reads: ${result.summary.read_count}, Writes: ${result.summary.write_count}\n`);

  if (result.primary_definition) {
    console.log(`Primary Definition: ${result.primary_definition.filename}:${result.primary_definition.line}\n`);
  }

  // Group by file
  for (const [file, refs] of Object.entries(result.by_file)) {
    console.log(`${file}:`);
    for (const ref of refs) {
      const flags = [];
      if (ref.is_definition) flags.push('def');
      if (ref.is_write) flags.push('write');
      const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
      console.log(`  ${ref.line}:${ref.column_start} - ${ref.symbol_type}${flagStr}`);
      if (ref.context) {
        console.log(`    ${ref.context}`);
      }
    }
    console.log();
  }
};

const reference_definition = async ({ project, symbol, filename, line }) => {
  const project_id = await getProjectId(project);
  const result = await go_to_definition(project_id, symbol, { filename, line: line ? parseInt(line) : undefined });

  console.log(`\n=== Definition of '${symbol}' ===\n`);

  if (!result.found) {
    console.log(result.message);
    return;
  }

  const def = result.definition;
  console.log(`File: ${def.filename}`);
  console.log(`Line: ${def.line}${def.end_line ? ` - ${def.end_line}` : ''}`);
  console.log(`Type: ${def.symbol_type}`);

  if (def.parameters) {
    console.log(`Parameters: ${def.parameters}`);
  }
  if (def.return_type) {
    console.log(`Return Type: ${def.return_type}`);
  }
  if (def.comment) {
    console.log(`\nComment:\n${def.comment}`);
  }
  if (def.context) {
    console.log(`\nContext: ${def.context}`);
  }
};

const reference_list = async ({ project, type }) => {
  const project_id = await getProjectId(project);
  const result = await list_definitions(project_id, { symbol_type: type });

  console.log(`\n=== Definitions in ${project}${type ? ` (type: ${type})` : ''} ===\n`);
  console.log(`Total: ${result.summary.total_definitions} definitions in ${result.summary.file_count} files\n`);

  if (result.summary.type_counts) {
    console.log('By Type:');
    for (const [t, count] of Object.entries(result.summary.type_counts)) {
      console.log(`  ${t}: ${count}`);
    }
    console.log();
  }

  // Show by file (limited)
  let shown = 0;
  const maxShow = 50;
  for (const [file, defs] of Object.entries(result.by_file)) {
    if (shown >= maxShow) {
      console.log(`... and ${result.summary.total_definitions - shown} more definitions`);
      break;
    }
    console.log(`${file}:`);
    for (const def of defs) {
      if (shown >= maxShow) break;
      console.log(`  ${def.line}: ${def.symbol} (${def.symbol_type})`);
      shown++;
    }
  }
};

const reference_summary = async ({ project }) => {
  const project_id = await getProjectId(project);
  const result = await get_symbol_reference_summary(project_id);

  console.log(`\n=== Symbol Reference Summary for ${project} ===\n`);
  console.log(`Unique Symbols: ${result.summary.unique_symbols}`);
  console.log(`Total References: ${result.summary.total_references}`);
  console.log(`Total Definitions: ${result.summary.total_definitions}\n`);

  if (result.summary.type_counts) {
    console.log('By Type:');
    for (const [type, count] of Object.entries(result.summary.type_counts)) {
      console.log(`  ${type}: ${count} symbols`);
    }
    console.log();
  }

  console.log('Top Referenced Symbols:');
  for (const item of result.top_symbols.slice(0, 20)) {
    console.log(`  ${item.symbol} (${item.symbol_type}): ${item.reference_count} refs, ${item.definition_count} defs`);
  }
};

const reference_at = async ({ project, filename, line, column }) => {
  const project_id = await getProjectId(project);
  const result = await find_symbols_at_location(
    project_id,
    filename,
    parseInt(line),
    column ? parseInt(column) : undefined
  );

  console.log(`\n=== Symbols at ${filename}:${line}${column ? ':' + column : ''} ===\n`);

  if (result.length === 0) {
    console.log('No symbols found at this location.');
    return;
  }

  for (const sym of result) {
    console.log(`${sym.symbol} (${sym.symbol_type})`);
    console.log(`  Column: ${sym.column_start}-${sym.column_end}`);
    if (sym.is_definition) console.log(`  Definition: yes`);
    if (sym.is_write) console.log(`  Write: yes`);
    if (sym.definition_filename) {
      console.log(`  Defined at: ${sym.definition_filename}:${sym.definition_line}`);
    }
    if (sym.context) {
      console.log(`  Context: ${sym.context}`);
    }
    console.log();
  }
};

const reference = {
  command: 'reference',
  description: 'Cross-reference browser for finding symbol usages',
  commands: {
    find: reference_find,
    definition: reference_definition,
    list: reference_list,
    summary: reference_summary,
    at: reference_at
  },
  help,
  command_help: {
    find: find_help,
    definition: definition_help,
    list: list_help,
    summary: summary_help,
    at: at_help
  },
  command_arguments: {
    find: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      symbol: {
        type: 'string',
        description: 'Symbol name to find references for',
        required: true
      },
      filename: {
        type: 'string',
        description: 'Filter by filename'
      },
      'definitions-only': {
        type: 'boolean',
        description: 'Only return definitions'
      }
    },
    definition: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      symbol: {
        type: 'string',
        description: 'Symbol name to find definition for',
        required: true
      },
      filename: {
        type: 'string',
        description: 'File where the reference is (for context)'
      },
      line: {
        type: 'number',
        description: 'Line where the reference is (for context)'
      }
    },
    list: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      type: {
        type: 'string',
        description: 'Filter by symbol type (function, class, variable, etc.)'
      }
    },
    summary: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    at: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      filename: {
        type: 'string',
        description: 'Filename',
        required: true
      },
      line: {
        type: 'number',
        description: 'Line number',
        required: true
      },
      column: {
        type: 'number',
        description: 'Column number for precise matching'
      }
    }
  }
};

export { reference };
