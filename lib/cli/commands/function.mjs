'use strict';

import { get_project_by_name } from '../../model/project.mjs';
import {
  get_entity_symbols,
  entity_search,
  get_entity
} from '../../model/entity.mjs';
import {
  get_entities_by_caller_id,
  get_entities_by_callee_id
} from '../../model/relationship.mjs';

const help = `usage: cb function [<args>]

Gives access to functions, allowing for listing, searching, and usage of functions.

  * list - Provides a list of known functions
  * search - Searches for a function
  * retrieve - Retrieves the function and information about it
  * callers - Lists any functions that call this function
  * callees - Lists any functions that this function calls
`;

const list_help = `usage: cb function list --project=<project_name> [--filename=<file_name>]

List all functions that are currently known.
`;

const search_help = `usage: cb function search --name=[name] [--project=<project>] [--filename=<filename>]

Search for a function by name.  Partial matches will be returned, and the
search is case-insensitive.

Arguments:

  * --name=[name] - Name of the function to search for (required)
  * --project=[project] - Name of the project to narrow the search
  * --filename=[filename] - Name of the file to search in
`;

const retrieve_help = `usage: cb function retrieve --name=[name] [--project=<project>] [--filename=<filename>]

Retrieve the function and information about it.

Arguments:

  * --name=[name] - Name of the function to retrieve (required)
  * --project=[project] - Name of the project to narrow the search
  * --filename=[filename] - Name of the file to search in
`;

const callers_help = `usage: cb function caller --name=[name] [--project=<project>] [--filename=<filename>]

Retrieve all callers known for a function and information for them.

Arguments:

  * --name=[name] - Name of the function to retrieve callers for (required)
  * --project=[project] - Only retrieve callers from this project
`;

const callees_help = `usage: cb function caller --name=[name] [--project=<project>] [--filename=<filename>]

Retrieve all callees known for a function and information for them.

Arguments:

  * --name=[name] - Name of the function to retrieve callees for (required)
  * --project=[project] - Only retrieve callees from this project
`;

const function_list = async ({ project, filename }) => {
  const projects = await get_project_by_name({ name: project });

  if (projects.length === 0) {
    throw new Error(`Project '${project}' not found`);
  }

  const symbols = await get_entity_symbols({
    project_id: projects[0].id,
    filename,
    type: 'function'
  });

  console.log(`Functions:\n`);
  for (const symbol of symbols) {
    console.log(
      `  * ${symbol.symbol}${symbol.parameters} - ${symbol.filename}:${symbol.start_line}`
    );
  }
};

const function_search = async ({ name, project, filename, limit }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });

    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await entity_search({
    project_id,
    filename,
    symbol: name,
    type: 'function',
    limit
  });

  if (results.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  console.log(`Functions:\n`);
  for (const symbol of results) {
    console.log(
      `  * ${symbol.symbol}${symbol.parameters} - ${symbol.filename}:${symbol.start_line}`
    );
  }
};

const function_retrieve = async ({ name, project, filename }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });

    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await get_entity({
    project_id,
    filename,
    symbol: name,
    type: 'function'
  });

  if (results.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  // We should only have one function.
  const [function_symbol] = results;
  console.log(`Function:\n`);
  console.log(
    `${function_symbol.symbol}${function_symbol.parameters} - ${function_symbol.filename}:${function_symbol.start_line}

${function_symbol.comment}
${function_symbol.source}
`
  );
};

const function_callers = async ({ name, project }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });

    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await get_entities_by_callee_id({
    project_id,
    symbol: name,
    type: 'function'
  });

  if (results.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  console.log(`Calls made to ${name}:\n`);
  // Iterate through the function symbols and print them.
  for (const caller of results) {
    console.log(
      `  * ${caller.caller_symbol} ${caller.caller_filename}:${caller.caller_start_line}`
    );
  }
};

const function_callees = async ({ name, project }) => {
  let project_id;
  if (project !== undefined) {
    const projects = await get_project_by_name({ name: project });

    if (projects.length !== 0) {
      project_id = projects[0].id;
    }
  }

  const results = await get_entities_by_caller_id({
    project_id,
    symbol: name,
    type: 'function'
  });

  if (results.length === 0) {
    throw new Error(`Function '${name}' not found`);
  }

  console.log(`Calls made from ${name}:\n`);
  // Iterate through the function symbols and print them.
  for (const caller of results) {
    console.log(
      `  * ${caller.callee_symbol}${caller.callee_parameters} ${caller.caller_filename}:${caller.relationship_line} => ${caller.callee_filename}:${caller.callee_start_line}`
    );
  }
};

const func = {
  command: 'function',
  description: 'Tools for querying functions',
  commands: {
    list: function_list,
    search: function_search,
    retrieve: function_retrieve,
    callers: function_callers,
    callees: function_callees
  },
  help,
  command_help: {
    list: list_help,
    search: search_help,
    retrieve: retrieve_help,
    callers: callers_help,
    callees: callees_help
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
        description: 'Filename to limit list to'
      }
    },
    search: {
      name: {
        type: 'string',
        description: 'Name of the function to search for',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project'
      },
      filename: {
        type: 'string',
        description: 'Filename to limit list to'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default 10)'
      }
    },
    retrieve: {
      name: {
        type: 'string',
        description: 'Name of the function to retrieve',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project'
      },
      filename: {
        type: 'string',
        description: 'Filename to limit list to'
      }
    },
    callers: {
      name: {
        type: 'string',
        description: 'Name of the function to find callers for',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project'
      },
      filename: {
        type: 'string',
        description: 'Filename to limit list to'
      }
    },
    callees: {
      name: {
        type: 'string',
        description: 'Name of the function to find callees for',
        required: true
      },
      project: {
        type: 'string',
        description: 'Name of the project'
      },
      filename: {
        type: 'string',
        description: 'Filename to limit list to'
      }
    }
  }
};

export { func };
