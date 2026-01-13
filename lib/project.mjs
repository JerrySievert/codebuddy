'use strict';

/**
 * @fileoverview Project management and code parsing module.
 * Handles creating, refreshing, and importing projects from local paths or git URLs.
 * Parses source files using tree-sitter and extracts entities (functions) and relationships.
 * @module lib/project
 */

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
import {
  insert_or_update_entity,
  batch_insert_or_update_entities,
  get_entity
} from './model/entity.mjs';
import { insert_or_update_sourcecode } from './model/sourcecode.mjs';
import {
  insert_relationship,
  batch_insert_relationships,
  clear_relationships_for_project
} from './model/relationship.mjs';

import { extname, relative, isAbsolute } from 'path';
import { existsSync, rmSync } from 'fs';
import { is_git_url, clone_repository, pull_repository, REPOS_DIR } from './git.mjs';

/**
 * Convert an absolute path to a path relative to the project root.
 * For git repos, this gives us paths like "src/main.c" instead of "/Users/.../repos/project/src/main.c"
 * @param {string} absolutePath - The absolute file path to convert
 * @param {string} projectRoot - The root directory of the project
 * @returns {string} The relative path from projectRoot to absolutePath
 */
const make_relative_path = (absolutePath, projectRoot) => {
  if (!isAbsolute(absolutePath)) {
    return absolutePath; // Already relative
  }
  return relative(projectRoot, absolutePath);
};

/**
 * Extract all unique node types from a tree-sitter parse tree.
 * @param {Object} tree - A tree-sitter parse tree
 * @returns {string[]} Array of unique node type strings found in the tree
 */
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

/**
 * Find the function entity that contains a given line of code (the caller).
 * @param {Object[]} entities - Array of entity objects to search
 * @param {Object} params - Search parameters
 * @param {number} params.project_id - The project ID
 * @param {number} params.line - The line number to find the containing function for
 * @param {string} params.filename - The filename to search within
 * @param {string} params.symbol - The symbol to exclude from results (the callee)
 * @returns {Object|undefined} The entity that contains the given line, or undefined
 */
const find_caller = (entities, { project_id, line, filename, symbol }) => {
  for (const entity of entities) {
    if (
      symbol !== entity.symbol &&
      entity.start_line <= line &&
      entity.end_line >= line &&
      entity.filename === filename
    ) {
      return entity;
    }
  }
};

/**
 * Create a composite key for known_entities to handle same-named functions in different files.
 * @param {string} symbol - The function/entity symbol name
 * @param {string} filename - The filename containing the entity
 * @returns {string} A unique key in the format "filename::symbol"
 */
const entity_key = (symbol, filename) => `${filename}::${symbol}`;

/**
 * Find a comment entity that appears immediately before the given line.
 * @param {Object[]} entities - Array of comment entities to search
 * @param {Object} params - Search parameters
 * @param {number} params.start_line - The line number of the function/entity
 * @param {string} [params.filename] - Optional filename to filter by
 * @param {string} [params.symbol] - Optional symbol (unused but kept for API consistency)
 * @returns {Object|undefined} The comment entity ending on the line before start_line
 */
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

/**
 * Find a source entity that starts at the given line.
 * @param {Object[]} entities - Array of source entities to search
 * @param {Object} params - Search parameters
 * @param {number} params.start_line - The line number to match
 * @param {string} [params.filename] - Optional filename to filter by
 * @returns {Object|undefined} The matching source entity, or undefined
 */
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

/**
 * Find a parameter entity that spans the given line range.
 * @param {Object[]} entities - Array of parameter entities to search
 * @param {Object} params - Search parameters
 * @param {number} params.start_line - The start line of the range
 * @param {number} params.end_line - The end line of the range
 * @param {string} [params.filename] - Optional filename to filter by
 * @returns {Object|undefined} The matching parameter entity, or undefined
 */
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

/**
 * Find a type entity that starts at the given line.
 * @param {Object[]} entities - Array of type entities to search
 * @param {Object} params - Search parameters
 * @param {number} params.start_line - The line number to match
 * @param {string} [params.filename] - Optional filename to filter by
 * @returns {Object|undefined} The matching type entity, or undefined
 */
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

/**
 * Create caller/callee relationships between function entities.
 * Analyzes function call expressions to determine which functions call which other functions.
 * @param {Object} options - Options object
 * @param {number} options.project_id - The project ID
 * @param {Object} options.known_entities - Map of known entities keyed by symbol and filename::symbol
 * @param {Object[]} options.entities - Array of call expression entities to process
 * @param {Object[]} options.comments - Array of comment entities for annotation
 * @returns {Promise<void>}
 */
const create_relationships_for_entities = async ({
  project_id,
  known_entities,
  entities,
  comments
}) => {
  // Build index structures for fast lookup
  const entitiesArray = Object.values(known_entities);

  // Index entities by filename for faster caller lookup
  const entitiesByFile = new Map();
  for (const entity of entitiesArray) {
    if (!entitiesByFile.has(entity.filename)) {
      entitiesByFile.set(entity.filename, []);
    }
    entitiesByFile.get(entity.filename).push(entity);
  }

  // Index comments by filename and end_line for O(1) lookup
  const commentIndex = new Map();
  for (const comment of comments) {
    const key = `${comment.filename}:${comment.end_line}`;
    commentIndex.set(key, comment);
  }

  // Collect all unique callee symbols we need to look up
  const unknownCallees = new Set();
  for (const entity of entities) {
    const callee = entity.content.substring(0, entity.content.indexOf('('));
    if (!known_entities[callee]) {
      unknownCallees.add(callee);
    }
  }

  // Batch fetch unknown callees from database
  if (unknownCallees.size > 0) {
    const calleeSymbols = Array.from(unknownCallees);
    // Fetch in batches of 100 to avoid query size limits
    // Search across ALL projects, not just the current one
    for (let i = 0; i < calleeSymbols.length; i += 100) {
      const batch = calleeSymbols.slice(i, i + 100);
      for (const sym of batch) {
        if (!known_entities[sym]) {
          const callees = await get_entity({ symbol: sym, type: 'function' });
          if (callees.length > 0) {
            known_entities[sym] = callees[0];
          }
        }
      }
    }
  }

  // Build relationships in memory first
  const relationships = [];

  for (const entity of entities) {
    const callee = entity.content.substring(0, entity.content.indexOf('('));

    // Find caller using file-indexed lookup
    const fileEntities = entitiesByFile.get(entity.filename) || [];
    let caller = null;
    for (const e of fileEntities) {
      if (
        callee !== e.symbol &&
        e.start_line <= entity.start_line &&
        e.end_line >= entity.start_line
      ) {
        caller = e;
        break;
      }
    }

    if (!caller) continue;

    const callee_entity = known_entities[callee];
    if (!callee_entity) continue;

    // Find comment using indexed lookup
    const commentKey = `${entity.filename}:${entity.start_line - 1}`;
    const comment = commentIndex.get(commentKey);

    relationships.push({
      callee: callee_entity.id,
      caller: caller.id,
      line: entity.start_line,
      comment: comment ? comment.content : null
    });
  }

  // Batch insert all relationships at once
  if (relationships.length > 0) {
    // Insert in chunks of 1000 to avoid potential limits
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < relationships.length; i += CHUNK_SIZE) {
      const chunk = relationships.slice(i, i + CHUNK_SIZE);
      await batch_insert_relationships(chunk);
    }
  }
};

/**
 * Extract the function name from a function node based on the programming language.
 * Handles different node types for JavaScript (function_declaration, method_definition,
 * arrow_function, function_expression), Python (function_definition), and C/C++.
 * @param {Object} entity - The entity containing the function node
 * @param {Object} entity.node - The tree-sitter node representing the function
 * @param {number} entity.start_line - The starting line number
 * @param {string} entity.content - The source code content of the function
 * @param {string} language - The programming language ('javascript', 'python', 'c', etc.)
 * @returns {string} The extracted function name, or 'anonymous_N' / 'unknown_N' for unnamed functions
 */
const get_function_name = (entity, language) => {
  const node = entity.node;

  if (language === 'javascript') {
    // For JavaScript, look for the function name in different node types
    if (node.type === 'function_declaration') {
      // function foo() {} - name is the identifier child
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'identifier') {
          return child.text;
        }
      }
    } else if (node.type === 'method_definition') {
      // class method - look for property_identifier
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'property_identifier') {
          return child.text;
        }
      }
    } else if (
      node.type === 'arrow_function' ||
      node.type === 'function_expression'
    ) {
      // Arrow functions and function expressions may be assigned to a variable
      // We need to look at the parent for the variable name
      const parent = node.parent;
      if (parent && parent.type === 'variable_declarator') {
        for (let i = 0; i < parent.childCount; i++) {
          const child = parent.child(i);
          if (child.type === 'identifier') {
            return child.text;
          }
        }
      }
      // Anonymous function - use line number as identifier
      return `anonymous_${entity.start_line}`;
    }
    return `anonymous_${entity.start_line}`;
  }

  if (language === 'python') {
    // For Python, function name is an identifier child of function_definition
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier') {
        return child.text;
      }
    }
    return `anonymous_${entity.start_line}`;
  }

  if (language === 'java') {
    // For Java, method/constructor name is an identifier child
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier') {
        return child.text;
      }
    }
    return `anonymous_${entity.start_line}`;
  }

  if (language === 'csharp') {
    // For C#, method/constructor name is an identifier child
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier') {
        return child.text;
      }
    }
    return `anonymous_${entity.start_line}`;
  }

  if (language === 'typescript' || language === 'tsx') {
    // TypeScript uses same structure as JavaScript
    if (node.type === 'function_declaration') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'identifier') {
          return child.text;
        }
      }
    } else if (node.type === 'method_definition') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'property_identifier') {
          return child.text;
        }
      }
    } else if (
      node.type === 'arrow_function' ||
      node.type === 'function_expression'
    ) {
      const parent = node.parent;
      if (parent && parent.type === 'variable_declarator') {
        for (let i = 0; i < parent.childCount; i++) {
          const child = parent.child(i);
          if (child.type === 'identifier') {
            return child.text;
          }
        }
      }
      return `anonymous_${entity.start_line}`;
    }
    return `anonymous_${entity.start_line}`;
  }

  // C and default: parse from content
  const content = entity.content;
  const parenIdx = content.indexOf('(');
  if (parenIdx === -1) return `unknown_${entity.start_line}`;

  const name_parts = content
    .substring(0, parenIdx)
    .replace(/\s+/g, ' ')
    .replace(/\*/g, '')
    .split(' ');
  return (
    name_parts[name_parts.length - 1].trim() || `unknown_${entity.start_line}`
  );
};

/**
 * Prepare entity objects from parsed tree-sitter nodes without inserting to database.
 * Extracts function definitions, associates comments, parameters, and return types.
 * @param {Object} options - Options object
 * @param {number} options.project_id - The project ID
 * @param {Object} options.nodes - Parsed nodes from get_nodes_from_source
 * @param {Object[]} options.nodes.function_definition - Array of function definition nodes
 * @param {Object[]} options.nodes.comment - Array of comment nodes
 * @param {Object[]} options.nodes.parameter_list - Array of parameter list nodes
 * @param {string} options.filename - The source filename (should be relative path)
 * @param {string} options.language - The programming language
 * @returns {Object[]} Array of entity objects ready for batch database insert
 */
const prepare_entities_for_nodes = ({
  project_id,
  nodes,
  filename,
  language
}) => {
  const entities = [];

  // Build comment index for O(1) lookup
  const commentByEndLine = new Map();
  for (const comment of nodes.comment) {
    commentByEndLine.set(comment.end_line, comment);
  }

  for (const entity of nodes.function_definition) {
    // Get the function name based on language
    const name = get_function_name(entity, language);

    // Skip empty or invalid names
    if (!name || name.startsWith('unknown_')) continue;

    // Create entity object
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
      source: entity.content,
      comment: null,
      return_type: 'void'
    };

    // Get comment using indexed lookup
    const comment_entity = commentByEndLine.get(new_entity.start_line - 1);
    if (comment_entity) {
      new_entity.comment = comment_entity.content;
    }

    // Get parameters
    for (const param of nodes.parameter_list) {
      if (
        param.start_line >= new_entity.start_line &&
        param.end_line <= new_entity.end_line
      ) {
        new_entity.parameters = param.content.replace(/\s+/g, ' ');
        break;
      }
    }

    // Get the return type
    const return_type = get_return_type_from_function(entity, language);
    new_entity.return_type = return_type;

    entities.push(new_entity);
  }

  return entities;
};

/**
 * Create entities for parsed nodes and insert them to the database one at a time.
 * Legacy function maintained for backwards compatibility - prefer batch_insert_or_update_entities.
 * @param {Object} options - Options object
 * @param {number} options.project_id - The project ID
 * @param {Object} options.nodes - Parsed nodes from get_nodes_from_source
 * @param {string} options.filename - The source filename
 * @param {string} options.language - The programming language
 * @param {Object} options.known_entities - Map to populate with created entities
 * @param {string} options.source - The source code (unused but kept for API consistency)
 * @returns {Promise<void>}
 * @deprecated Use prepare_entities_for_nodes with batch_insert_or_update_entities instead
 */
const create_entities_for_nodes = async ({
  project_id,
  nodes,
  filename,
  language,
  known_entities,
  source
}) => {
  const entities = prepare_entities_for_nodes({
    project_id,
    nodes,
    filename,
    language
  });

  for (const new_entity of entities) {
    const res = await insert_or_update_entity(new_entity);

    // Stash a copy of the entity using composite key (filename::symbol)
    known_entities[entity_key(new_entity.symbol, filename)] = res[0];
    // Also keep a by-symbol lookup for callee resolution
    if (!known_entities[new_entity.symbol]) {
      known_entities[new_entity.symbol] = res[0];
    }
  }
};

/**
 * Create a new project from a local path or git URL.
 * @param {Object} options
 * @param {string} [options.name] - Project name (optional, derived from path/URL if not provided)
 * @param {string} options.path - Local file path or git URL
 * @returns {Promise<Object>} - The created project
 */
const create_project = async ({ name, path }) => {
  let projectPath = path;  // The path to store in DB (git URL or local path)
  let localPath = path;    // The actual local path for processing
  let projectName = name;
  let gitUrl = null;
  let needsCleanup = false;

  try {
    // Handle git URLs
    if (is_git_url(path)) {
      gitUrl = path;
      projectPath = path;  // Store the git URL as the path
      const result = await clone_repository(path, name);
      localPath = result.path;
      needsCleanup = true;  // Mark for cleanup if something fails
      projectName = name || result.name;
    } else {
      // Expand ~ to home directory for local paths
      if (path.startsWith('~')) {
        const { homedir } = await import('os');
        localPath = path.replace('~', homedir());
        projectPath = localPath;
      }

      // Validate local path exists
      if (!existsSync(localPath)) {
        throw new Error(`Path '${localPath}' does not exist.`);
      }

      // Derive name from path if not provided
      if (!projectName) {
        const { basename } = await import('path');
        projectName = basename(localPath);
      }
    }

    // Check to see if there is a project by this name already.
    let projects = await get_project_by_name({ name: projectName });
    if (projects.length) {
      throw new Error(`Project '${projectName}' already exists.`);
    }

    // Check to see if there is a project with this path already.
    projects = await get_project_by_path({ path: projectPath });
    if (projects.length) {
      throw new Error(`Project at path '${projectPath}' already exists.`);
    }

    await create_or_update_project({
      name: projectName,
      path: projectPath,
      local_path: localPath,
      git_url: gitUrl
    });

    return await refresh_project_stats();
  } catch (error) {
    // Clean up git checkout on failure
    if (needsCleanup && localPath.startsWith(REPOS_DIR)) {
      try {
        console.log(`Cleaning up failed import: ${localPath}`);
        rmSync(localPath, { recursive: true, force: true });
      } catch (e) {
        console.error(`Failed to clean up: ${e.message}`);
      }
    }
    throw error;
  }
};

/**
 * Refresh an existing project by re-parsing all source files.
 * For git projects, pulls the latest changes before refreshing.
 * @param {Object} options - Options object
 * @param {string} options.name - The name of the project to refresh
 * @returns {Promise<Object>} Updated project statistics
 * @throws {Error} If the project does not exist
 */
const refresh_project = async ({ name }) => {
  // Check to see if there is a project by this name already.
  let projects = await get_project_by_name({ name });
  if (!projects.length) {
    throw new Error(`Project '${name}' does not exist.`);
  }

  const project = projects[0];
  let localPath = project.path;
  let gitUrl = project.git_url;

  // If it's a git project, clone/pull to get latest
  if (gitUrl || is_git_url(project.path)) {
    const url = gitUrl || project.path;
    const result = await clone_repository(url, name);
    localPath = result.path;
    gitUrl = url;
  }

  await create_or_update_project({
    name,
    path: project.path,
    local_path: localPath,
    git_url: gitUrl
  });

  return await refresh_project_stats();
};

/**
 * Map a file extension to a programming language identifier.
 * @param {string} filename - The filename to extract extension from
 * @returns {string} Language identifier ('c', 'cpp', 'javascript', 'python', or 'unknown')
 */
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
    case '.jsx':
      return 'javascript';
    case '.py':
      return 'python';
    case '.pyw':
      return 'python';
    case '.java':
      return 'java';
    case '.cs':
      return 'csharp';
    case '.ts':
    case '.mts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    default:
      return 'unknown';
  }
};

/**
 * Create a new project or update an existing one by parsing all source files.
 * Handles file discovery, parsing, entity extraction, and relationship creation.
 * For git projects, cleans up the local checkout after processing.
 * @param {Object} options - Options object
 * @param {string} options.name - The project name
 * @param {string} options.path - The path to store in DB (git URL or local path)
 * @param {string} [options.local_path] - The actual local path for processing (for git projects)
 * @param {string} [options.git_url] - The git URL if this is a git project
 * @param {string[]} [options.types=['c','h','cpp','hpp','cc','js','mjs','py']] - File extensions to process
 * @returns {Promise<void>}
 * @throws {Error} If no source files are found
 */
const create_or_update_project = async ({
  name,
  path,
  local_path,
  git_url,
  types = ['c', 'h', 'cpp', 'hpp', 'cc', 'js', 'mjs', 'py', 'java', 'cs', 'ts', 'mts', 'tsx']
}) => {
  const startTime = Date.now();

  // Use local_path for actual file processing, path is what's stored in DB
  const workingPath = local_path || path;
  const isGitProject = !!git_url || (local_path && local_path.startsWith(REPOS_DIR));

  // Set up our known entities.
  const known_entities = {};

  // Set up our functions calls for later.
  const function_calls = [];

  // And our comments.
  const comments = [];

  // Collect all entities for batch insert
  const allEntities = [];

  // Get a copy of all source files using absolute path (worker threads don't support chdir)
  const files = [];

  for (const type of types) {
    const filenames = await get_all_filenames_with_type(workingPath, type);
    files.push(...filenames);
  }

  if (files.length === 0) {
    throw new Error('No source files found.');
  }

  console.log(`Found ${files.length} files to process`);

  // Create the project.
  const project = await insert_or_update_project({ name, path, git_url });
  const project_id = project[0].id;

  // Phase 1: Parse all files and collect entities
  console.log('Phase 1: Parsing files...');
  const parseStart = Date.now();

  // Process files in parallel batches for better performance
  const PARSE_BATCH_SIZE = 10;

  for (let i = 0; i < files.length; i += PARSE_BATCH_SIZE) {
    const batch = files.slice(i, i + PARSE_BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (absoluteFilename) => {
        // Convert to relative path for storage (relative to project root)
        const relativeFilename = make_relative_path(absoluteFilename, workingPath);

        const source = await import_file(absoluteFilename);
        const nodes = get_nodes_from_source(source, absoluteFilename);
        const language = get_language_from_extension(absoluteFilename);

        const fileEntities = prepare_entities_for_nodes({
          project_id,
          nodes,
          filename: relativeFilename,  // Use relative path in entities
          language
        });

        // Update call_expression and comment filenames to relative paths
        const call_expressions = nodes.call_expression.map(node => ({
          ...node,
          filename: relativeFilename
        }));
        const fileComments = nodes.comment.map(node => ({
          ...node,
          filename: relativeFilename
        }));

        return {
          filename: relativeFilename,  // Store relative path
          source,
          call_expressions,
          comments: fileComments,
          entities: fileEntities
        };
      })
    );

    // Collect results and write source to DB
    for (const result of results) {
      await insert_or_update_sourcecode({
        project_id,
        filename: result.filename,
        source: result.source
      });

      function_calls.push(...result.call_expressions);
      comments.push(...result.comments);
      allEntities.push(...result.entities);
    }
  }

  console.log(
    `Phase 1 complete: ${Date.now() - parseStart}ms - ${allEntities.length} entities, ${function_calls.length} calls`
  );

  // Phase 2: Batch insert all entities
  console.log('Phase 2: Inserting entities...');
  const insertStart = Date.now();

  if (allEntities.length > 0) {
    // Insert in chunks to avoid potential size limits
    const CHUNK_SIZE = 500;
    for (let i = 0; i < allEntities.length; i += CHUNK_SIZE) {
      const chunk = allEntities.slice(i, i + CHUNK_SIZE);
      const inserted = await batch_insert_or_update_entities(chunk);

      // Update known_entities with inserted records
      for (const entity of inserted) {
        known_entities[entity_key(entity.symbol, entity.filename)] = entity;
        if (!known_entities[entity.symbol]) {
          known_entities[entity.symbol] = entity;
        }
      }
    }
  }

  console.log(`Phase 2 complete: ${Date.now() - insertStart}ms`);

  // Phase 3: Create relationships
  console.log('Phase 3: Creating relationships...');
  const relStart = Date.now();

  // Clear the relationships before repopulating them.
  await clear_relationships_for_project(project[0]);

  // Now create the relationships for all known calls.
  await create_relationships_for_entities({
    project_id,
    entities: function_calls,
    known_entities,
    comments
  });

  console.log(`Phase 3 complete: ${Date.now() - relStart}ms`);
  console.log(`Total import time: ${Date.now() - startTime}ms`);

  // Clean up git checkout if this was a git project
  if (isGitProject && workingPath.startsWith(REPOS_DIR)) {
    try {
      console.log(`Cleaning up git checkout: ${workingPath}`);
      rmSync(workingPath, { recursive: true, force: true });
    } catch (e) {
      console.error(`Failed to clean up git checkout: ${e.message}`);
    }
  }
};

export {
  create_project,
  refresh_project,
  get_types_from_tree,
  prepare_entities_for_nodes
};
