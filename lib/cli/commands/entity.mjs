'use strict';

import { get_project_by_name } from '../../model/project.mjs';
import {
  get_entity_symbols,
  entity_search,
  get_entity,
  get_entity_by_id,
  get_class_members
} from '../../model/entity.mjs';

const help = `usage: cb entity [<args>]

Gives access to entities (functions, classes, structs), allowing for listing, searching, and retrieving members.

  * list - Lists all entities in a project
  * search - Searches for entities by name
  * members - Lists member functions of a class or struct
`;

const list_help = `usage: cb entity list --project=<project_name> [--filename=<file_name>] [--type=<type>]

List all entities in a project.

Arguments:

  * --project=[project] - Name of the project (required)
  * --filename=[filename] - Filter by filename
  * --type=[type] - Filter by entity type (function, class, struct)
`;

const search_help = `usage: cb entity search --name=[name] [--project=<project>] [--type=<type>] [--limit=<limit>]

Search for entities by name. Partial matches will be returned, and the
search is case-insensitive.

Arguments:

  * --name=[name] - Name of the entity to search for (required)
  * --project=[project] - Name of the project to narrow the search
  * --type=[type] - Filter by entity type (function, class, struct)
  * --limit=[limit] - Maximum number of results (default 10)
`;

const members_help = `usage: cb entity members --id=[id]

List member functions of a class or struct by its entity ID.

Arguments:

  * --id=[id] - Entity ID of the class or struct (required)
`;

const entity_list = async ({ project, filename, type }) => {
  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }

  const symbols = await get_entity_symbols({
    project_id: projects[0].id,
    filename,
    type
  });

  if (symbols.length === 0) {
    console.log('No entities found.');
    return;
  }

  // Group by type for better display
  const grouped = {};
  for (const symbol of symbols) {
    if (!grouped[symbol.type]) {
      grouped[symbol.type] = [];
    }
    grouped[symbol.type].push(symbol);
  }

  for (const [entityType, entities] of Object.entries(grouped)) {
    console.log(`\n${entityType.charAt(0).toUpperCase() + entityType.slice(1)}s:\n`);
    for (const entity of entities) {
      const params = entity.parameters || '';
      console.log(
        `  [${entity.id}] ${entity.symbol}${params} - ${entity.filename}:${entity.start_line}`
      );
    }
  }
};

const entity_search_cmd = async ({ name, project, type, limit = 10 }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });
    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await entity_search({
    project_id,
    symbol: name,
    type,
    limit
  });

  if (results.length === 0) {
    console.log(`No entities found matching '${name}'`);
    return;
  }

  console.log(`\nEntities matching '${name}':\n`);
  for (const entity of results) {
    const params = entity.parameters || '';
    console.log(
      `  [${entity.id}] ${entity.type}: ${entity.symbol}${params} - ${entity.filename}:${entity.start_line}`
    );
  }
};

const entity_members = async ({ id }) => {
  const entity = await get_entity_by_id(id);

  if (!entity) {
    throw new Error(`Entity with ID ${id} not found`);
  }

  if (entity.type !== 'class' && entity.type !== 'struct') {
    throw new Error(`Entity is not a class or struct (type: ${entity.type})`);
  }

  console.log(`\n${entity.type.charAt(0).toUpperCase() + entity.type.slice(1)}: ${entity.symbol}`);
  console.log(`File: ${entity.filename}:${entity.start_line}-${entity.end_line}\n`);

  const members = await get_class_members({
    project_id: entity.project_id,
    filename: entity.filename,
    start_line: entity.start_line,
    end_line: entity.end_line
  });

  if (members.length === 0) {
    console.log('No member functions found.');
    return;
  }

  console.log(`Member functions:\n`);
  for (const member of members) {
    const params = member.parameters || '';
    const returnType = member.return_type ? `: ${member.return_type}` : '';
    console.log(
      `  [${member.id}] ${member.symbol}${params}${returnType} - line ${member.start_line}`
    );
  }
};

const entity = {
  command: 'entity',
  description: 'Tools for querying entities (functions, classes, structs)',
  commands: {
    list: entity_list,
    search: entity_search_cmd,
    members: entity_members
  },
  help,
  command_help: {
    list: list_help,
    search: search_help,
    members: members_help
  },
  command_arguments: {
    list: {
      project: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      filename: {
        type: 'string',
        description: 'Filename to filter by'
      },
      type: {
        type: 'string',
        description: 'Entity type (function, class, struct)'
      }
    },
    search: {
      name: {
        type: 'string',
        description: 'Name of the entity to search for',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project'
      },
      type: {
        type: 'string',
        description: 'Entity type (function, class, struct)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default 10)'
      }
    },
    members: {
      id: {
        type: 'number',
        description: 'Entity ID of the class or struct',
        required: true
      }
    }
  }
};

export { entity };
