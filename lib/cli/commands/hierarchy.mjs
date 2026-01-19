'use strict';

import { get_project_by_name } from '../../model/project.mjs';
import {
  get_class_hierarchy,
  find_implementations,
  analyze_class_hierarchy
} from '../../analysis/index.mjs';

const help = `usage: cb hierarchy [<args>]

Class hierarchy browser for inheritance analysis.

  * tree - Get the inheritance hierarchy tree for a class
  * implementations - Find all implementations of an interface/class
  * analysis - Analyze the complete class hierarchy of a project
`;

const tree_help = `usage: cb hierarchy tree --project=<project> --symbol=<symbol> [--direction=<direction>] [--max-depth=<depth>]

Get the inheritance hierarchy tree for a class or struct.

Arguments:

  * --project=[project] - Name of the project (required)
  * --symbol=[symbol] - Class or struct symbol name (required)
  * --direction=[direction] - Direction to traverse: up, down, or both (default: both)
  * --max-depth=[depth] - Maximum depth to traverse (default: 10)
`;

const implementations_help = `usage: cb hierarchy implementations --project=<project> --symbol=<symbol>

Find all classes that implement a specific interface or extend a class.

Arguments:

  * --project=[project] - Name of the project (required)
  * --symbol=[symbol] - Interface or base class symbol name (required)
`;

const analysis_help = `usage: cb hierarchy analysis --project=<project>

Analyze the complete class hierarchy of a project.

Arguments:

  * --project=[project] - Name of the project (required)
`;

// Helper to get project ID
const get_project_id = async (project) => {
  const projects = await get_project_by_name({ name: project });
  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }
  return projects[0].id;
};

// Helper to print a tree structure
const print_tree = (nodes, prop, indent = '') => {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const is_last = i === nodes.length - 1;
    const prefix = is_last ? '└── ' : '├── ';
    const child_indent = is_last ? '    ' : '│   ';

    let label = node.symbol;
    if (node.relationship_type) {
      label += ` (${node.relationship_type})`;
    }
    if (node.filename) {
      label += ` [${node.filename}:${node.start_line || '?'}]`;
    }

    console.log(`${indent}${prefix}${label}`);

    if (node[prop] && node[prop].length > 0) {
      print_tree(node[prop], prop, indent + child_indent);
    }
  }
};

const hierarchy_tree = async ({
  project,
  symbol,
  direction,
  'max-depth': max_depth
}) => {
  const project_id = await get_project_id(project);
  const result = await get_class_hierarchy(project_id, symbol, {
    direction: direction || 'both',
    max_depth: max_depth ? parseInt(max_depth) : 10
  });

  console.log(`\n=== Class Hierarchy for '${symbol}' ===\n`);

  if (!result.found) {
    console.log(result.message);
    return;
  }

  const entity = result.entity;
  console.log(`Class: ${symbol}`);
  console.log(`File: ${entity.filename}:${entity.start_line}`);
  console.log(`Type: ${entity.type}`);
  if (entity.is_abstract) console.log(`Abstract: yes`);
  if (entity.parent_class) console.log(`Parent Class: ${entity.parent_class}`);
  if (entity.interfaces && entity.interfaces.length > 0) {
    console.log(`Interfaces: ${entity.interfaces.join(', ')}`);
  }
  console.log();

  console.log(
    `Summary: ${result.summary.ancestor_count} ancestors, ${result.summary.descendant_count} descendants`
  );
  console.log(
    `Direct Parents: ${result.summary.direct_parents}, Direct Children: ${result.summary.direct_children}\n`
  );

  if (result.ancestors && result.ancestors.length > 0) {
    console.log('Ancestors (parents and their parents):');
    print_tree(result.ancestors, 'ancestors');
    console.log();
  }

  if (result.descendants && result.descendants.length > 0) {
    console.log('Descendants (children and their children):');
    print_tree(result.descendants, 'descendants');
    console.log();
  }

  if (result.ancestors.length === 0 && result.descendants.length === 0) {
    console.log('No inheritance relationships found for this class.');
  }
};

const hierarchy_implementations = async ({ project, symbol }) => {
  const project_id = await get_project_id(project);
  const result = await find_implementations(project_id, symbol);

  console.log(`\n=== Implementations of '${symbol}' ===\n`);

  console.log(`Total: ${result.summary.total_implementations} implementations`);
  console.log(
    `Extends: ${result.summary.extends_count}, Implements: ${result.summary.implements_count}, Embeds: ${result.summary.embeds_count}\n`
  );

  if (result.implementations.length === 0) {
    console.log('No implementations found.');
    return;
  }

  // Group by relationship type
  for (const [type, impls] of Object.entries(result.by_relationship_type)) {
    console.log(`${type.charAt(0).toUpperCase() + type.slice(1)}:`);
    for (const impl of impls) {
      console.log(`  ${impl.child_symbol}`);
      if (impl.child_filename) {
        console.log(
          `    ${impl.child_filename}:${impl.child_start_line || '?'}`
        );
      }
    }
    console.log();
  }
};

const hierarchy_analysis = async ({ project }) => {
  const project_id = await get_project_id(project);
  const result = await analyze_class_hierarchy(project_id);

  console.log(`\n=== Class Hierarchy Analysis for ${project} ===\n`);

  const summary = result.summary;
  console.log('Summary:');
  console.log(`  Total Classes/Structs: ${summary.total_classes}`);
  console.log(`  Total Relationships: ${summary.total_relationships}`);
  console.log(`  Root Classes (no parents): ${summary.root_class_count}`);
  console.log(`  Leaf Classes (no children): ${summary.leaf_class_count}`);
  console.log(`  Abstract Classes: ${summary.abstract_class_count}`);
  console.log(`  Max Inheritance Depth: ${summary.max_inheritance_depth}`);
  console.log(`  Avg Children Per Class: ${summary.avg_children_per_class}`);
  console.log();

  console.log('Relationship Types:');
  console.log(`  Extends: ${summary.extends_count}`);
  console.log(`  Implements: ${summary.implements_count}`);
  console.log(`  Embeds: ${summary.embeds_count}`);
  console.log();

  if (result.deepest_inheritance) {
    console.log('Deepest Inheritance Chain:');
    console.log(
      `  ${result.deepest_inheritance.symbol} (depth: ${result.deepest_inheritance.depth})`
    );
    console.log(`  ${result.deepest_inheritance.filename}`);
    console.log();
  }

  if (result.root_classes.length > 0) {
    console.log('Root Classes (sample):');
    for (const cls of result.root_classes.slice(0, 10)) {
      console.log(
        `  ${cls.symbol} (${cls.type}) - ${cls.filename}:${cls.start_line}`
      );
    }
    if (result.root_classes.length > 10) {
      console.log(`  ... and ${result.root_classes.length - 10} more`);
    }
    console.log();
  }

  if (result.abstract_classes.length > 0) {
    console.log('Abstract Classes:');
    for (const cls of result.abstract_classes.slice(0, 10)) {
      console.log(`  ${cls.symbol} - ${cls.filename}:${cls.start_line}`);
    }
    if (result.abstract_classes.length > 10) {
      console.log(`  ... and ${result.abstract_classes.length - 10} more`);
    }
    console.log();
  }
};

const hierarchy = {
  command: 'hierarchy',
  description: 'Class hierarchy browser for inheritance analysis',
  commands: {
    tree: hierarchy_tree,
    implementations: hierarchy_implementations,
    analysis: hierarchy_analysis
  },
  help,
  command_help: {
    tree: tree_help,
    implementations: implementations_help,
    analysis: analysis_help
  },
  command_arguments: {
    tree: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      symbol: {
        type: 'string',
        description: 'Class or struct symbol name',
        required: true
      },
      direction: {
        type: 'string',
        description: 'Direction to traverse: up, down, or both (default: both)'
      },
      'max-depth': {
        type: 'number',
        description: 'Maximum depth to traverse (default: 10)'
      }
    },
    implementations: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      symbol: {
        type: 'string',
        description: 'Interface or base class symbol name',
        required: true
      }
    },
    analysis: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    }
  }
};

export { hierarchy };
