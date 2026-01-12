'use strict';

import {
  insert_or_update_project,
  get_project_by_name,
  get_project_by_path,
  refresh_project_stats
} from './model/project.mjs';
import { get_all_filenames_with_type, import_file } from './sourcecode.mjs';
import {
  get_nodes_from_source,
  get_return_type_from_function
} from './functions.mjs';
import { insert_or_update_entity, get_entity } from './model/entity.mjs';
import { insert_or_update_sourcecode } from './model/sourcecode.mjs';
import {
  insert_relationship,
  clear_relationships_for_project
} from './model/relationship.mjs';

import { extname } from 'path';

const get_types_from_tree = (tree) => {
  const result = {};

  const types = {};
  let visited_children = false;
  let cursor = tree.walk();

  while (true) {
    if (!visited_children) {
      result[cursor.currentNode.type] = true;

      if (!cursor.gotoFirstChild()) {
        visited_children = true;
      }
    } else if (cursor.gotoNextSibling()) {
      visited_children = false;
    } else if (!cursor.gotoParent()) {
      break;
    }
  }

  return Object.keys(result);
};

const find_caller = (entities, { project_id, line, filename, symbol }) => {
  for (const entity of entities) {
    if (
      symbol !== entity.symbol &&
      entity.start_line <= line &&
      entity.end_line >= line &&
      (filename ? filename === entity.filename : true)
    ) {
      return entity;
    }
  }
};

// Find a comment entity for the given line and file.
const get_comment = (entities, { start_line, filename, symbol }) => {
  for (const entity of entities) {
    if (
      entity.end_line === start_line - 1 &&
      (filename ? filename === entity.filename : true)
    ) {
      return entity;
    }
  }
};

const get_source = (entities, { start_line, filename }) => {
  for (const entity of entities) {
    if (
      entity.start_line === start_line &&
      (filename ? filename === entity.filename : true)
    ) {
      return entity;
    }
  }
};

const get_parameters = (entities, { start_line, end_line, filename }) => {
  for (const entity of entities) {
    if (
      entity.start_line <= start_line &&
      end_line >= entity.end_line &&
      (filename ? filename === entity.filename : true)
    ) {
      return entity;
    }
  }
};

const get_type = (entities, { start_line, filename }) => {
  for (const entity of entities) {
    if (
      entity.start_line === start_line &&
      (filename ? filename === entity.filename : true)
    ) {
      return entity;
    }
  }
};

const create_relationships_for_entities = async ({
  project_id,
  known_entities,
  entities,
  comments
}) => {
  // Iterate through the call_expressions.
  for (const entity of entities) {
    let callee;
    try {
      // Get the callee symbol without parentheses.
      callee = entity.content.substring(0, entity.content.indexOf('('));

      // Attempt to find the caller in our known entities.
      const caller = find_caller(Object.values(known_entities), {
        project_id,
        line: entity.start_line,
        symbol: callee,
        filename: entity.filename
      });

      // No caller in our known entities, weird.
      if (!caller) {
        continue;
      }

      // Find the callee entity.
      let callee_entity = known_entities[callee];

      // If we do not know about the entity, try to retrieve it from the project.
      if (!callee_entity) {
        const callees = await get_entity({ project_id, symbol: callee });
        if (callees.length > 0) {
          callee_entity = callees[0];
        }
      }

      // If we still do not know about the entity, try to retrieve it without a project.
      if (!callee_entity) {
        const callees = await get_entity({ symbol: callee });
        if (callees.length > 0) {
          callee_entity = callees[0];
        }
      }

      // If we still don't have one, then continue on.
      if (!callee_entity) {
        // Likely a function we don't know about, ok.
        continue;
      }

      // Set up the known entity.
      known_entities[callee] = callee_entity;

      // Find a comment if there is one.
      const comment = get_comment(comments, {
        start_line: entity.start_line,
        filename: entity.filename,
        symbol: callee
      });

      // And add the relationship for this entity couplet.
      await insert_relationship({
        callee: callee_entity.id,
        caller: caller.id,
        line: entity.start_line,
        comment: comment ? comment.content : null
      });
    } catch (error) {
      console.error(`Error processing function ${callee}: ${error.message}`);
      throw error;
    }
  }
};

const create_entities_for_nodes = async ({
  project_id,
  nodes,
  filename,
  language,
  known_entities,
  source
}) => {
  //console.log(JSON.stringify(nodes.parameter_list, null, 2));
  // Iterate through the entities for functions.
  for (const entity of nodes.function_definition) {
    // Get the function name.
    const name_parts = entity.content
      .substring(0, entity.content.indexOf('('))
      .replace(/\s+/g, ' ')
      .replace(/\*/g, '')
      .split(' ');
    const name = name_parts[name_parts.length - 1].trim();
    console.log(`language: ${language}`);
    // And create a default entity.
    const new_entity = {
      project_id,
      symbol: name,
      type: 'function',
      language,
      filename,
      start_line: entity.start_line,
      end_line: entity.end_line,
      start_position: entity.start_position,
      end_position: entity.end_position,
      parameters: null,
      source: null,
      comment: null,
      return_type: 'void'
    };

    // Get a copy of the comment if there is one.
    const comment_entity = get_comment(nodes.comment, {
      symbol: new_entity.symbol,
      start_line: new_entity.start_line,
      filename
    });

    if (comment_entity) {
      new_entity.comment = comment_entity.content;
    }

    // Get a copy of the source code.
    const source_entity = get_source(nodes.function_definition, {
      start_line: new_entity.start_line,
      end_line: new_entity.end_line,
      filename
    });

    if (source_entity) {
      new_entity.source = source_entity.content;
    }

    // Get a copy of the parameters.
    const parameters_entity = get_parameters(nodes.parameter_list, {
      start_line: new_entity.start_line,
      end_line: new_entity.end_line,
      filename
    });
    //console.log(parameters_entity);
    if (parameters_entity) {
      new_entity.parameters = parameters_entity.content.replace(/\s+/g, ' ');
    }

    // Get the return type by traversing the function_definition node's children.
    const return_type = get_return_type_from_function(entity);
    new_entity.return_type = return_type;

    // Insert the new entity into the database.
    const res = await insert_or_update_entity(new_entity);

    // Stash a copy of the entity.
    known_entities[new_entity.symbol] = res[0];
  }
};

const create_project = async ({ name, path }) => {
  // Check to see if there is a project by this name already.
  let projects = await get_project_by_name({ name });
  if (projects.length) {
    throw new Error(`Project '${name}' already exists.`);
  }

  // Check to see if there is a project with this path already.
  projects = await get_project_by_path({ path });
  if (projects.length) {
    throw new Error(`Project '${path}' already exists.`);
  }

  await create_or_update_project({ name, path });

  return await refresh_project_stats();
};

const refresh_project = async ({ name }) => {
  // Check to see if there is a project by this name already.
  let projects = await get_project_by_name({ name });
  if (!projects.length) {
    throw new Error(`Project '${name}' does not exist.`);
  }

  await create_or_update_project({ name, path: projects[0].path });

  return await refresh_project_stats();
};

// Given a filename, get the extension and then map it to a language.
const get_language_from_extension = (filename) => {
  const extension = extname(filename).toLowerCase();
  switch (extension) {
    case '.c':
      return 'c';
    case '.h':
      return 'c';
    case '.cpp':
      return 'cpp';
    case '.hpp':
      return 'cpp';
    case '.cc':
      return 'cpp';
    case '.js':
      return 'javascript';
    case '.mjs':
      return 'javascript';
    default:
      return 'unknown';
  }
};

const create_or_update_project = async ({
  name,
  path,
  types = ['c', 'h', 'cpp', 'hpp', 'cc', 'js', 'mjs']
}) => {
  // Set up our known entities.
  const known_entities = {};

  // Set up our functions calls for later.
  const function_calls = [];

  // And our comments.
  const comments = [];

  // Get a copy of our CWD so we can come back to it later.
  const cwd = process.cwd();

  // Change directory to the project path.
  process.chdir(path);

  // Get a copy of all .c and .h files.
  const files = [];

  for (const type of types) {
    const filenames = await get_all_filenames_with_type('.', type);
    files.push(...filenames);
  }

  if (files.length === 0) {
    throw new Error('No source files found.');
  }

  // Create the project.
  const project = await insert_or_update_project({ name, path });

  // Iterate through the files.
  for (const filename of files) {
    // Read the file content.
    const source = await import_file(filename);

    // Write it to the database.
    await insert_or_update_sourcecode({
      project_id: project[0].id,
      filename,
      source
    });

    // Get a copy of the tree nodes to work from.
    const nodes = get_nodes_from_source(source, filename);

    // Save a copy of our function calls.
    function_calls.push(...nodes.call_expression);

    // Save a copy of our comments.
    comments.push(...nodes.comment);

    const language = get_language_from_extension(filename);

    // Create this file's entities.
    await create_entities_for_nodes({
      source,
      project_id: project[0].id,
      nodes,
      filename,
      language,
      known_entities
    });
  }

  // Clear the relationships before repopulating them.
  await clear_relationships_for_project(project[0]);

  // Now create the relationsips for all known calls.
  await create_relationships_for_entities({
    project_id: project[0].id,
    entities: function_calls,
    known_entities,
    comments
  });

  process.chdir(cwd);
};

export { create_project, refresh_project, get_types_from_tree };
