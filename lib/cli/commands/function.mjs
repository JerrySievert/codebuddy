'use strict';

const help = `usage: cb function [<args>]

Gives access to functions, allowing for listing, searching, and usage of functions.

  * list - Provides a list of known functions
  * search - Searches for a function
  * retrieve - Retrieves the function and information about it
  * callers - Lists any functions that call this function
  * callees - Lists any functions that this function calls
`;

const list_help = `usage: cb function list [--project=<project_name>] [--filename=<file_name>]

List all functions that are currently known.
`;

const search_help = `usage: cb function search --function=[function] [--project=<project>] [--filename=<filename>]

Search for a function by name.  Partial matches will be returned, and the
search is case-insensitive.

Arguments:

  * --function=[function] - Name of the function to search for (required)
  * --project=[project] - Name of the project
  * --filename=[filename] - Name of the file to search in
`;

const retrieve_help = `usage: cb function retrieve --function=[function] [--project=<project>] [--filename=<filename>]

Retrieve the function and information about it.

Arguments:

  * --function=[function] - Name of the function to retrieve (required)
  * --project=[project] - Name of the project
  * --filename=[filename] - Name of the file to search in
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

const func = {
  command: 'function',
  description: 'Tools for querying functions',
  commands: {
    list: function_list
  },
  help,
  command_help: {
    list: list_help
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
    }
  }
};

export { func };
