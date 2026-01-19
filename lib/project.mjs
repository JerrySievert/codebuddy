'use strict';

/**
 * @fileoverview Project management and code parsing module.
 * Handles creating, refreshing, and importing projects from local paths or git URLs.
 * Parses source files using tree-sitter and extracts entities (functions) and relationships.
 * @module lib/project
 *
 * HARD REQUIREMENT: Cross-project relationships must be preserved.
 * ================================================================
 * Relationships between functions can cross projects (e.g., project A calling
 * functions in project B). This means:
 *
 * 1. NEVER use DELETE + INSERT strategies for entities - this destroys
 *    relationships FROM other projects INTO the project being reimported.
 *
 * 2. Always use ON CONFLICT (upsert) for entities so that entity IDs are
 *    preserved and existing relationships remain valid.
 *
 * 3. When clearing data, only clear data that is scoped entirely within
 *    the project (e.g., sourcecode, references within the project).
 *
 * This requirement has been violated multiple times - DO NOT add "fast insert"
 * or "bulk delete" optimizations that would break cross-project relationships.
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
  get_return_type_from_function,
  get_all_identifiers_from_source,
  extract_inheritance_from_source
} from './functions.mjs';
import {
  insert_or_update_entity,
  batch_insert_or_update_entities,
  get_entity,
  batch_get_entities_by_symbols
} from './model/entity.mjs';
import { batch_insert_or_update_sourcecode } from './model/sourcecode.mjs';
import {
  batch_insert_relationships,
  clear_relationships_for_project
} from './model/relationship.mjs';
import { clear_references_for_project } from './model/reference.mjs';
import {
  batch_insert_symbol_references,
  disable_symbol_reference_indexes,
  rebuild_symbol_reference_indexes,
  clear_symbol_references_for_project
} from './model/symbol_reference.mjs';
import {
  batch_insert_inheritance,
  clear_inheritance_for_project
} from './model/inheritance.mjs';
import { update_entity_inheritance } from './model/entity.mjs';

import { extname, relative, isAbsolute } from 'path';
import { existsSync, rmSync } from 'fs';
import {
  is_git_url,
  clone_repository,
  pull_repository,
  REPOS_DIR
} from './git.mjs';
import { create_parser_pool, DEFAULT_THREAD_COUNT } from './parser-pool.mjs';

/**
 * Convert an absolute path to a path relative to the project root.
 * For git repos, this gives us paths like "src/main.c" instead of "/Users/.../repos/project/src/main.c"
 * @param {string} absolutePath - The absolute file path to convert
 * @param {string} projectRoot - The root directory of the project
 * @returns {string} The relative path from projectRoot to absolutePath
 */
const make_relative_path = (absolute_path, project_root) => {
  if (!isAbsolute(absolute_path)) {
    return absolute_path; // Already relative
  }
  return relative(project_root, absolute_path);
};

/**
 * Create a composite key for known_entities to handle same-named functions in different files.
 * @param {string} symbol - The function/entity symbol name
 * @param {string} filename - The filename containing the entity
 * @returns {string} A unique key in the format "filename::symbol"
 */
const entity_key = (symbol, filename) => `${filename}::${symbol}`;

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
  const entities_array = Object.values(known_entities);

  // Index entities by filename for faster caller lookup
  const entities_by_file = new Map();
  for (const entity of entities_array) {
    if (!entities_by_file.has(entity.filename)) {
      entities_by_file.set(entity.filename, []);
    }
    entities_by_file.get(entity.filename).push(entity);
  }

  // Index comments by filename and end_line for O(1) lookup
  const comment_index = new Map();
  for (const comment of comments) {
    const key = `${comment.filename}:${comment.end_line}`;
    comment_index.set(key, comment);
  }

  // Collect all unique callee symbols we need to look up
  const unknown_callees = new Set();
  for (const entity of entities) {
    const callee = entity.content.substring(0, entity.content.indexOf('('));
    if (!known_entities[callee]) {
      unknown_callees.add(callee);
    }
  }

  // Batch fetch unknown callees from database using single query with IN clause
  // This is MUCH faster than individual queries, especially for large repos
  // NOTE: We intentionally do NOT filter by project_id here because we want to
  // create cross-project relationships (e.g., pljs calling postgres's palloc)
  if (unknown_callees.size > 0) {
    const callee_symbols = Array.from(unknown_callees);
    // Fetch in batches of 1000 (IN clause can handle larger batches than individual queries)
    const BATCH_SIZE = 1000;
    for (let i = 0; i < callee_symbols.length; i += BATCH_SIZE) {
      const batch = callee_symbols.slice(i, i + BATCH_SIZE);
      const found_entities = await batch_get_entities_by_symbols(
        batch,
        'function'
      );
      for (const [sym, entity] of found_entities) {
        if (!known_entities[sym]) {
          known_entities[sym] = entity;
        }
      }
    }
  }

  // Build relationships in memory first
  const relationships = [];

  for (const entity of entities) {
    const callee = entity.content.substring(0, entity.content.indexOf('('));

    // Find caller using file-indexed lookup
    const file_entities = entities_by_file.get(entity.filename) || [];
    let caller = null;
    for (const e of file_entities) {
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
    const comment_key = `${entity.filename}:${entity.start_line - 1}`;
    const comment = comment_index.get(comment_key);

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
  const paren_idx = content.indexOf('(');
  if (paren_idx === -1) return `unknown_${entity.start_line}`;

  const name_parts = content
    .substring(0, paren_idx)
    .replace(/\s+/g, ' ')
    .replace(/\*/g, '')
    .split(' ');
  return (
    name_parts[name_parts.length - 1].trim() || `unknown_${entity.start_line}`
  );
};

/**
 * Extract the class name from a class node based on the programming language.
 * @param {Object} entity - The entity containing the class node
 * @param {Object} entity.node - The tree-sitter node representing the class
 * @param {number} entity.start_line - The starting line number
 * @param {string} entity.content - The source code content of the class
 * @param {string} language - The programming language
 * @returns {string} The extracted class name, or 'unknown_class_N' for unnamed classes
 */
const get_class_name = (entity, language) => {
  const node = entity.node;

  // Most languages use 'identifier' or 'type_identifier' for class names
  // JavaScript/TypeScript: class_declaration has identifier child
  // Python: class_definition has identifier child
  // Java/C#: class_declaration has identifier child
  // C++: class_specifier has type_identifier child
  // Go: type_declaration -> type_spec has type_identifier
  // Rust: struct_item has type_identifier (classes don't exist, but traits do)

  // Try common patterns
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (
      child.type === 'identifier' ||
      child.type === 'type_identifier' ||
      child.type === 'name'
    ) {
      return child.text;
    }
  }

  // For Go type declarations, look deeper
  if (language === 'go' && node.type === 'type_declaration') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_spec') {
        for (let j = 0; j < child.childCount; j++) {
          const grandchild = child.child(j);
          if (grandchild.type === 'type_identifier') {
            return grandchild.text;
          }
        }
      }
    }
  }

  // Fallback: try to parse from content
  const content = entity.content;
  const class_match = content.match(
    /(?:class|struct|interface|enum|type)\s+(\w+)/
  );
  if (class_match) {
    return class_match[1];
  }

  return `unknown_class_${entity.start_line}`;
};

/**
 * Extract the struct name from a struct node based on the programming language.
 * @param {Object} entity - The entity containing the struct node
 * @param {Object} entity.node - The tree-sitter node representing the struct
 * @param {number} entity.start_line - The starting line number
 * @param {string} entity.content - The source code content of the struct
 * @param {string} language - The programming language
 * @returns {string} The extracted struct name, or 'unknown_struct_N' for unnamed structs
 */
const get_struct_name = (entity, language) => {
  const node = entity.node;

  // C/C++: struct_specifier has type_identifier child
  // Go: type_declaration -> type_spec has type_identifier
  // Rust: struct_item has type_identifier child
  // C#: struct_declaration has identifier child

  // Try common patterns
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (
      child.type === 'identifier' ||
      child.type === 'type_identifier' ||
      child.type === 'name'
    ) {
      return child.text;
    }
  }

  // For Go type declarations, look deeper
  if (language === 'go' && node.type === 'type_declaration') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_spec') {
        for (let j = 0; j < child.childCount; j++) {
          const grandchild = child.child(j);
          if (grandchild.type === 'type_identifier') {
            return grandchild.text;
          }
        }
      }
    }
  }

  // Fallback: try to parse from content
  const content = entity.content;
  const struct_match = content.match(/struct\s+(\w+)/);
  if (struct_match) {
    return struct_match[1];
  }

  return `unknown_struct_${entity.start_line}`;
};

/**
 * Prepare entity objects from parsed tree-sitter nodes without inserting to database.
 * Extracts function definitions, class definitions, struct definitions, associates comments, parameters, and return types.
 * @param {Object} options - Options object
 * @param {number} options.project_id - The project ID
 * @param {Object} options.nodes - Parsed nodes from get_nodes_from_source
 * @param {Object[]} options.nodes.function_definition - Array of function definition nodes
 * @param {Object[]} options.nodes.class_definition - Array of class definition nodes
 * @param {Object[]} options.nodes.struct_definition - Array of struct definition nodes
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
  const comment_by_end_line = new Map();
  for (const comment of nodes.comment) {
    comment_by_end_line.set(comment.end_line, comment);
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
    const comment_entity = comment_by_end_line.get(new_entity.start_line - 1);
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

  // Process class definitions
  if (nodes.class_definition) {
    for (const entity of nodes.class_definition) {
      const name = get_class_name(entity, language);

      // Skip invalid names
      if (!name || name.startsWith('unknown_class_')) continue;

      const new_entity = {
        project_id,
        symbol: name,
        type: 'class',
        language,
        filename,
        start_line: entity.start_line,
        end_line: entity.end_line,
        start_position: entity.start_position,
        end_position: entity.end_position,
        parameters: null,
        source: entity.content,
        comment: null,
        return_type: null
      };

      // Get comment using indexed lookup
      const comment_entity = comment_by_end_line.get(new_entity.start_line - 1);
      if (comment_entity) {
        new_entity.comment = comment_entity.content;
      }

      entities.push(new_entity);
    }
  }

  // Process struct definitions
  if (nodes.struct_definition) {
    for (const entity of nodes.struct_definition) {
      const name = get_struct_name(entity, language);

      // Skip invalid names
      if (!name || name.startsWith('unknown_struct_')) continue;

      const new_entity = {
        project_id,
        symbol: name,
        type: 'struct',
        language,
        filename,
        start_line: entity.start_line,
        end_line: entity.end_line,
        start_position: entity.start_position,
        end_position: entity.end_position,
        parameters: null,
        source: entity.content,
        comment: null,
        return_type: null
      };

      // Get comment using indexed lookup
      const comment_entity = comment_by_end_line.get(new_entity.start_line - 1);
      if (comment_entity) {
        new_entity.comment = comment_entity.content;
      }

      entities.push(new_entity);
    }
  }

  return entities;
};

/**
 * Create a new project from a local path or git URL.
 * @param {Object} options
 * @param {string} [options.name] - Project name (optional, derived from path/URL if not provided)
 * @param {string} options.path - Local file path or git URL
 * @returns {Promise<Object>} - The created project
 */
const create_project = async ({
  name,
  path,
  on_progress = null,
  parser_threads = DEFAULT_THREAD_COUNT
}) => {
  let project_path = path; // The path to store in DB (git URL or local path)
  let local_path = path; // The actual local path for processing
  let project_name = name;
  let git_url = null;
  let needs_cleanup = false;

  try {
    // Handle git URLs
    if (is_git_url(path)) {
      if (on_progress) on_progress(5, 'Cloning repository...');
      git_url = path;
      project_path = path; // Store the git URL as the path
      const result = await clone_repository(path, name);
      local_path = result.path;
      needs_cleanup = true; // Mark for cleanup if something fails
      project_name = name || result.name;
    } else {
      // Expand ~ to home directory for local paths
      if (path.startsWith('~')) {
        const { homedir } = await import('os');
        local_path = path.replace('~', homedir());
        project_path = local_path;
      }

      // Validate local path exists
      console.log(`[PROJECT] Checking if path exists: "${local_path}"`);
      console.log(`[PROJECT] existsSync result: ${existsSync(local_path)}`);
      if (!existsSync(local_path)) {
        throw new Error(`Path '${local_path}' does not exist.`);
      }

      // Derive name from path if not provided
      if (!project_name) {
        const { basename } = await import('path');
        project_name = basename(local_path);
      }
    }

    // Check to see if there is a project by this name already.
    let projects = await get_project_by_name({ name: project_name });
    if (projects.length) {
      throw new Error(`Project '${project_name}' already exists.`);
    }

    // Check to see if there is a project with this path already.
    projects = await get_project_by_path({ path: project_path });
    if (projects.length) {
      throw new Error(`Project at path '${project_path}' already exists.`);
    }

    if (on_progress) on_progress(10, 'Starting project import...');
    await create_or_update_project({
      name: project_name,
      path: project_path,
      local_path: local_path,
      git_url: git_url,
      on_progress,
      parser_threads
    });

    return await refresh_project_stats();
  } catch (error) {
    // Clean up git checkout on failure
    if (needs_cleanup && local_path.startsWith(REPOS_DIR)) {
      try {
        console.log(`Cleaning up failed import: ${local_path}`);
        rmSync(local_path, { recursive: true, force: true });
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
const refresh_project = async ({
  name,
  on_progress = null,
  parser_threads = DEFAULT_THREAD_COUNT
}) => {
  // Check to see if there is a project by this name already.
  let projects = await get_project_by_name({ name });
  if (!projects.length) {
    throw new Error(`Project '${name}' does not exist.`);
  }

  const project = projects[0];
  let local_path = project.path;
  let git_url = project.git_url;

  // If it's a git project, clone/pull to get latest
  if (git_url || is_git_url(project.path)) {
    if (on_progress) on_progress(5, 'Pulling latest changes...');
    const url = git_url || project.path;
    const result = await clone_repository(url, name);
    local_path = result.path;
    git_url = url;
  }

  if (on_progress) on_progress(10, 'Starting project refresh...');
  await create_or_update_project({
    name,
    path: project.path,
    local_path: local_path,
    git_url: git_url,
    on_progress,
    parser_threads
  });

  return await refresh_project_stats();
};

/**
 * Hint to the garbage collector by clearing references.
 * Note: global.gc() is not available in worker threads, so this is now a no-op.
 * The main memory savings come from:
 * 1. Setting large variables to null when done
 * 2. Streaming data to DB instead of accumulating in memory
 * 3. Processing files sequentially instead of in parallel
 * @private
 */
const try_gc = () => {
  // global.gc() cannot be used in worker threads (--expose-gc not allowed)
  // V8 will automatically collect garbage when memory pressure increases
};

// ============================================================================
// Batch Operation Helpers
// ============================================================================

/**
 * Flush a batch of entities to the database and update the known_entities map.
 * @param {Array} batch_entities - Array of entity objects to insert
 * @param {Object} known_entities - Map of entity keys to minimal entity info
 * @param {Function} entity_key_fn - Function to generate entity keys
 * @returns {Promise<number>} Number of entities inserted
 * @private
 */
const flush_entity_batch = async (
  batch_entities,
  known_entities,
  entity_key_fn
) => {
  if (batch_entities.length === 0) return 0;

  const inserted = await batch_insert_or_update_entities(batch_entities);

  for (const entity of inserted) {
    const minimal_entity = {
      id: entity.id,
      symbol: entity.symbol,
      type: entity.type,
      filename: entity.filename,
      start_line: entity.start_line,
      end_line: entity.end_line
    };
    known_entities[entity_key_fn(entity.symbol, entity.filename)] =
      minimal_entity;
    if (!known_entities[entity.symbol]) {
      known_entities[entity.symbol] = minimal_entity;
    }
  }

  return inserted.length;
};

/**
 * Process inheritance relationships and insert into the database.
 * @param {Array} pending_inheritance - Array of inheritance info objects
 * @param {Map} class_entities_by_symbol - Map of class symbols to entity arrays
 * @returns {Promise<{inherit_count: number, inheritance_updates: Array}>} Results
 * @private
 */
const process_inheritance_batch = async (
  pending_inheritance,
  class_entities_by_symbol
) => {
  const inheritance_updates = [];
  const batch_inheritance = [];

  for (const class_info of pending_inheritance) {
    const entities = class_entities_by_symbol.get(class_info.class_name) || [];
    const entity = entities.find((e) => e.filename === class_info.filename);

    if (entity) {
      const parent_class =
        class_info.relationships.find((r) => r.relationship_type === 'extends')
          ?.parent_symbol || null;
      const interfaces = class_info.relationships
        .filter((r) => r.relationship_type === 'implements')
        .map((r) => r.parent_symbol);

      inheritance_updates.push({
        id: entity.id,
        parent_class: parent_class,
        interfaces: interfaces.length > 0 ? interfaces : null,
        is_abstract: class_info.is_abstract
      });

      for (const rel of class_info.relationships) {
        const parent_entities =
          class_entities_by_symbol.get(rel.parent_symbol) || [];
        const parent_entity =
          parent_entities.length > 0 ? parent_entities[0] : null;

        batch_inheritance.push({
          child_entity_id: entity.id,
          parent_entity_id: parent_entity?.id || null,
          parent_symbol: rel.parent_symbol,
          relationship_type: rel.relationship_type
        });
      }
    }
  }

  let inherit_count = 0;
  if (batch_inheritance.length > 0) {
    await batch_insert_inheritance(batch_inheritance);
    inherit_count = batch_inheritance.length;
  }

  return { inherit_count, inheritance_updates };
};

/**
 * Build a lookup map for class entities by symbol.
 * @param {Object} known_entities - Map of entity keys to minimal entity info
 * @returns {Map} Map of class symbols to entity arrays
 * @private
 */
const build_class_entity_map = (known_entities) => {
  const class_entities_by_symbol = new Map();
  for (const entity of Object.values(known_entities)) {
    if (entity.type === 'class' || entity.type === 'struct') {
      if (!class_entities_by_symbol.has(entity.symbol)) {
        class_entities_by_symbol.set(entity.symbol, []);
      }
      class_entities_by_symbol.get(entity.symbol).push(entity);
    }
  }
  return class_entities_by_symbol;
};

// ============================================================================
// Phase Execution Helpers
// ============================================================================

/**
 * Phase 1: Parse all files and extract entities, sourcecode, calls, and symbol refs.
 * @param {Object} context - Phase context with shared state
 * @returns {Promise<Object>} Results including total counts
 * @private
 */
const execute_phase1_parsing = async (context) => {
  const {
    project_id,
    files,
    working_path,
    parser_threads,
    use_memory_saving_mode,
    should_drop_indexes,
    on_progress
  } = context;

  console.log(
    `Phase 1: Parsing files (parallel with ${parser_threads} threads)...`
  );
  const parse_start = Date.now();

  // Clear references before inserting new ones
  await clear_references_for_project({ id: project_id });
  await clear_symbol_references_for_project({ id: project_id });
  await clear_inheritance_for_project({ id: project_id });

  // Disable indexes for bulk loading in very large repos (>5000 files)
  if (should_drop_indexes) {
    console.log('  Disabling symbol reference indexes for bulk loading...');
    await disable_symbol_reference_indexes();
  }

  // Set up accumulators
  const known_entities = {};
  let function_calls = [];
  let comments = [];
  let pending_inheritance = [];

  const DB_BATCH_SIZE = 50;
  const SYMBOL_REF_BATCH_SIZE = 2000;
  const PROGRESS_UPDATE_INTERVAL = 10;

  let total_entities = 0;
  let total_calls = 0;
  let total_symbol_refs = 0;

  let batch_sourcecodes = [];
  let batch_entities = [];
  let batch_symbol_refs = [];

  // Create parser pool
  const parser_pool = create_parser_pool(parser_threads);
  await parser_pool.init();

  // Prepare file list
  const file_list = files.map((absolute_filename) => ({
    absoluteFilename: absolute_filename,
    relativeFilename: make_relative_path(absolute_filename, working_path)
  }));

  let completed_files = 0;
  let last_progress_report = 0;
  let last_progress_update = 0;

  // Process results as they complete
  const process_result = async (result) => {
    if (!result.success) {
      console.warn(
        `  Warning: Failed to parse ${result.filename}: ${result.error}`
      );
      return;
    }

    batch_sourcecodes.push({
      project_id,
      filename: result.filename,
      source: result.source
    });
    batch_entities.push(...result.entities);

    for (const call of result.functionCalls) {
      function_calls.push(call);
    }
    for (const comment of result.comments) {
      comments.push(comment);
    }
    total_calls += result.functionCalls.length;

    for (const ref of result.symbolRefs) {
      batch_symbol_refs.push(ref);
    }
    for (const inherit of result.inheritance) {
      pending_inheritance.push(inherit);
    }

    completed_files++;

    // Flush to DB when we hit batch size
    if (batch_sourcecodes.length >= DB_BATCH_SIZE) {
      await batch_insert_or_update_sourcecode(batch_sourcecodes);
      batch_sourcecodes = [];

      total_entities += await flush_entity_batch(
        batch_entities,
        known_entities,
        entity_key
      );
      batch_entities = [];

      if (use_memory_saving_mode) {
        try_gc();
      }
    }

    // Progress reporting
    if (
      on_progress &&
      completed_files - last_progress_update >= PROGRESS_UPDATE_INTERVAL
    ) {
      last_progress_update = completed_files;
      const phase1_progress =
        20 + Math.round((completed_files / files.length) * 50);
      on_progress(
        phase1_progress,
        `Phase 1: Parsed ${completed_files}/${files.length} files (${total_entities} entities)`
      );
    }

    // Flush symbol refs
    if (batch_symbol_refs.length >= SYMBOL_REF_BATCH_SIZE) {
      await batch_insert_symbol_references(batch_symbol_refs);
      total_symbol_refs += batch_symbol_refs.length;
      batch_symbol_refs = [];
    }

    if (completed_files - last_progress_report >= 500) {
      console.log(
        `  Processed ${completed_files}/${files.length} files (${total_entities} entities, ${total_symbol_refs} refs)`
      );
      last_progress_report = completed_files;
    }
  };

  // Parse all files
  await parser_pool.parseFiles(file_list, project_id, async (result) => {
    await process_result(result);
  });

  await parser_pool.terminate();

  // Flush remaining batches
  if (batch_sourcecodes.length > 0) {
    await batch_insert_or_update_sourcecode(batch_sourcecodes);
  }
  total_entities += await flush_entity_batch(
    batch_entities,
    known_entities,
    entity_key
  );
  if (batch_symbol_refs.length > 0) {
    await batch_insert_symbol_references(batch_symbol_refs);
    total_symbol_refs += batch_symbol_refs.length;
  }

  if (on_progress) {
    on_progress(
      70,
      `Phase 1: Parsed ${files.length}/${files.length} files (${total_entities} entities)`
    );
  }
  console.log(
    `  Processed ${files.length}/${files.length} files (${total_entities} entities, ${total_symbol_refs} refs)`
  );

  // Rebuild indexes if they were dropped
  if (should_drop_indexes) {
    console.log('  Rebuilding symbol reference indexes...');
    const index_start = Date.now();
    await rebuild_symbol_reference_indexes();
    console.log(`  Indexes rebuilt in ${Date.now() - index_start}ms`);
  }

  console.log(
    `Phase 1 complete: ${Date.now() - parse_start}ms - ${total_entities} entities, ${total_calls} calls, ${total_symbol_refs} symbol refs`
  );

  return {
    known_entities,
    function_calls,
    comments,
    pending_inheritance,
    total_entities,
    total_calls,
    total_symbol_refs
  };
};

/**
 * Phase 2: Create caller/callee relationships.
 * @param {Object} context - Phase context
 * @param {Object} phase1_results - Results from Phase 1
 * @returns {Promise<void>}
 * @private
 */
const execute_phase2_relationships = async (context, phase1_results) => {
  const { project_id, on_progress } = context;
  const { known_entities, function_calls, comments } = phase1_results;

  console.log('Phase 2: Creating relationships...');
  if (on_progress) {
    on_progress(
      72,
      `Phase 2: Creating relationships for ${function_calls.length} calls...`
    );
  }
  const rel_start = Date.now();

  await clear_relationships_for_project({ id: project_id });

  await create_relationships_for_entities({
    project_id,
    entities: function_calls,
    known_entities,
    comments
  });

  console.log(`Phase 2 complete: ${Date.now() - rel_start}ms`);
  if (on_progress) {
    on_progress(78, 'Phase 2: Relationships created');
  }
};

/**
 * Phase 3: Process inheritance relationships.
 * @param {Object} context - Phase context
 * @param {Object} phase1_results - Results from Phase 1
 * @returns {Promise<void>}
 * @private
 */
const execute_phase3_inheritance = async (context, phase1_results) => {
  const { on_progress } = context;
  const { known_entities, pending_inheritance } = phase1_results;

  console.log('Phase 3: Processing inheritance...');
  if (on_progress) {
    on_progress(80, 'Phase 3: Processing inheritance...');
  }
  const phase3_start = Date.now();

  const class_entities_by_symbol = build_class_entity_map(known_entities);

  const { inherit_count, inheritance_updates } =
    await process_inheritance_batch(
      pending_inheritance,
      class_entities_by_symbol
    );

  if (inheritance_updates.length > 0) {
    const { batch_update_entity_inheritance } = await import(
      './model/entity.mjs'
    );
    const UPDATE_CHUNK_SIZE = 500;
    for (let i = 0; i < inheritance_updates.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = inheritance_updates.slice(i, i + UPDATE_CHUNK_SIZE);
      await batch_update_entity_inheritance(chunk);
    }
  }

  console.log(`Phase 3 complete: ${Date.now() - phase3_start}ms`);
  console.log(`  - Inheritance relationships: ${inherit_count}`);
  if (on_progress) {
    on_progress(
      85,
      `Phase 3: Complete (${inherit_count} inheritance relationships)`
    );
  }
};

// ============================================================================
// Main Project Import Function
// ============================================================================

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
  types = [
    'c',
    'h',
    'cpp',
    'hpp',
    'cc',
    'js',
    'mjs',
    'py',
    'java',
    'cs',
    'ts',
    'mts',
    'tsx'
  ],
  on_progress = null,
  parser_threads = DEFAULT_THREAD_COUNT
}) => {
  const start_time = Date.now();

  // Use local_path for actual file processing, path is what's stored in DB
  const working_path = local_path || path;
  const is_git_project =
    !!git_url || (local_path && local_path.startsWith(REPOS_DIR));

  // Discover source files
  const files = [];
  for (const type of types) {
    const filenames = await get_all_filenames_with_type(working_path, type);
    files.push(...filenames);
  }

  if (files.length === 0) {
    throw new Error('No source files found.');
  }

  // Memory-saving thresholds
  const LARGE_REPO_THRESHOLD = 300;
  const VERY_LARGE_REPO_THRESHOLD = 1000;
  const INDEX_DROP_THRESHOLD = 5000;
  const use_memory_saving_mode = files.length > LARGE_REPO_THRESHOLD;
  const should_drop_indexes = files.length > INDEX_DROP_THRESHOLD;

  console.log(`Found ${files.length} files to process`);
  if (files.length > VERY_LARGE_REPO_THRESHOLD) {
    console.log(
      `Aggressive memory-saving mode enabled (>${VERY_LARGE_REPO_THRESHOLD} files)`
    );
  } else if (use_memory_saving_mode) {
    console.log(`Memory-saving mode enabled (>${LARGE_REPO_THRESHOLD} files)`);
  }

  // Create or update project record
  const project = await insert_or_update_project({ name, path, git_url });
  const project_id = project[0].id;

  // Build context for phase functions
  const context = {
    project_id,
    files,
    working_path,
    parser_threads,
    use_memory_saving_mode,
    should_drop_indexes,
    on_progress
  };

  // Execute the three phases
  const phase1_results = await execute_phase1_parsing(context);

  await execute_phase2_relationships(context, phase1_results);

  // Clear intermediate data to free memory
  phase1_results.function_calls = null;
  phase1_results.comments = null;
  try_gc();

  await execute_phase3_inheritance(context, phase1_results);

  // Clear remaining data
  phase1_results.known_entities = null;
  phase1_results.pending_inheritance = null;
  try_gc();

  console.log(`Total import time: ${Date.now() - start_time}ms`);

  // Clean up git checkout if this was a git project
  if (is_git_project && working_path.startsWith(REPOS_DIR)) {
    try {
      console.log(`Cleaning up git checkout: ${working_path}`);
      rmSync(working_path, { recursive: true, force: true });
    } catch (e) {
      console.error(`Failed to clean up git checkout: ${e.message}`);
    }
  }
};

/**
 * Returns the import threshold configuration for testing purposes.
 * @param {number} file_count - Number of files being imported
 * @returns {Object} Threshold configuration with use_memory_saving_mode and should_drop_indexes
 */
const get_import_thresholds = (file_count) => {
  const LARGE_REPO_THRESHOLD = 300;
  const VERY_LARGE_REPO_THRESHOLD = 1000;
  const INDEX_DROP_THRESHOLD = 5000;

  return {
    LARGE_REPO_THRESHOLD,
    VERY_LARGE_REPO_THRESHOLD,
    INDEX_DROP_THRESHOLD,
    use_memory_saving_mode: file_count > LARGE_REPO_THRESHOLD,
    should_drop_indexes: file_count > INDEX_DROP_THRESHOLD
  };
};

export {
  create_project,
  refresh_project,
  prepare_entities_for_nodes,
  get_import_thresholds
};
