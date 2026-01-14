'use strict';

import { homedir } from 'os';
import { create_project, refresh_project } from '../../project.mjs';

// Expand ~ to home directory in paths
const expand_path = (path) => {
  if (path.startsWith('~/')) {
    return path.replace('~', homedir());
  }
  if (path === '~') {
    return homedir();
  }
  return path;
};
import {
  get_all_projects_with_metadata,
  get_project_by_name,
  delete_project
} from '../../model/project.mjs';
import { get_function_counts } from '../../model/entity.mjs';

const help = `usage: cb project [<args>]

Gives access to projects, allowing for creation, updating, and listing.

  * list - Provides a list of projects currently known
  * import - Imports a project and its source
  * refresh - Refreshes the data for a project
  * delete - Deletes a project and all its data
  * info - Provides information about a project
`;

const list_help = `usage: cb project list

List all projects that are currently known.
`;
const import_help = `usage: cb project import --path=[path] --name=[name]

Import a new project, importing its source code into the system.

Arguments:

  * --path=[path] - Path of the project to import (required)
  * --name=[name] - Name of the project (required)
`;

const refresh_help = `usage: cb project refresh --name=[name]

Refresh the source of a project.

Arguments:

  * --name=[name] - Name of the project
`;

const delete_help = `usage: cb project delete --name=[name]

Delete a project and all associated data (entities, relationships, source code).

Arguments:

  * --name=[name] - Name of the project to delete (required)
`;

const info_help = `usage: cb project info --name=[name]

Provides specific information about a project including its path, and
source files associated with it.

Arguments:

  * --name=[name] - Name of the project (required)
`;

const project_list = async () => {
  const projects = await get_all_projects_with_metadata();
  console.log('Projects:');
  projects.forEach((project) => {
    console.log(`
${project.name}

  - Path: ${project.path}
  - Created: ${project.created_at.toLocaleString()}
  - Updated: ${project.updated_at.toLocaleString()}
  - Entities: ${project.entity_count}
  - Source Files: ${project.source_count}
`);
  });
};

const project_import = async ({ name, path }) => {
  await create_project({ name, path: expand_path(path) });
};

const project_refresh = async ({ name }) => {
  await refresh_project({ name });
};

const project_delete = async ({ name }) => {
  const project = await get_project_by_name({ name });

  if (project.length === 0) {
    throw new Error(`Project '${name}' not found`);
  }

  await delete_project(project[0].id);
  console.log(`Project '${name}' deleted successfully.`);
};

const project_info = async ({ name }) => {
  const project = await get_project_by_name({ name });

  if (project.length === 0) {
    throw new Error(`Project '${name}' not found`);
  }

  console.log(`Project: ${project[0].name}
Path: ${project[0].path}
`);

  const filenames = await get_function_counts({ project_id: project[0].id });

  if (filenames.length === 0) {
    console.log(`No functions found.`);
  } else {
    for (const filename of filenames) {
      console.log(
        `  * ${filename.filename} - ${filename.function_count} functions`
      );
    }
  }
};

const project = {
  command: 'project',
  description: 'Tools for managing projects',
  commands: {
    list: project_list,
    import: project_import,
    refresh: project_refresh,
    delete: project_delete,
    info: project_info
  },
  help,
  command_help: {
    list: list_help,
    import: import_help,
    refresh: refresh_help,
    delete: delete_help,
    info: info_help
  },
  command_arguments: {
    import: {
      path: {
        type: 'string',
        description: 'Path of the project to import',
        required: true
      },
      name: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    refresh: {
      name: {
        type: 'string',
        description: 'Name of the project',
        required: true
      }
    },
    delete: {
      name: {
        type: 'string',
        description: 'Name of the project to delete',
        required: true
      }
    },
    info: {
      name: {
        type: 'string',
        description: 'Name of the project',
        required: true
      },
      filename: {
        type: 'string',
        description: 'File name to get information on',
        required: false
      }
    }
  }
};

export { project };
