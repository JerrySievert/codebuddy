'use strict';

/**
 * @fileoverview Worker thread for parallel file parsing.
 * Parses source files using tree-sitter and extracts entities, calls, comments,
 * symbol references, and inheritance info.
 * @module lib/file-parser-worker
 */

import { parentPort } from 'worker_threads';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import {
  get_nodes_from_source,
  get_return_type_from_function,
  get_all_identifiers_from_source,
  extract_inheritance_from_source
} from './functions.mjs';

/**
 * Map a file extension to a programming language identifier.
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
 * Extract function name from a function node.
 */
const get_function_name = (entity, language) => {
  const node = entity.node;

  if (
    language === 'javascript' ||
    language === 'typescript' ||
    language === 'tsx'
  ) {
    if (node.type === 'function_declaration') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'identifier') return child.text;
      }
    } else if (node.type === 'method_definition') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'property_identifier') return child.text;
      }
    } else if (node.type === 'function_expression') {
      // First check if this is a named function expression (has its own identifier)
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'identifier') return child.text;
      }
      // Then check if it's assigned to a variable
      const parent = node.parent;
      if (parent && parent.type === 'variable_declarator') {
        for (let i = 0; i < parent.childCount; i++) {
          const child = parent.child(i);
          if (child.type === 'identifier') return child.text;
        }
      }
      return `anonymous_${entity.start_line}`;
    } else if (node.type === 'arrow_function') {
      // Arrow functions can't have names, but can be assigned to variables
      const parent = node.parent;
      if (parent && parent.type === 'variable_declarator') {
        for (let i = 0; i < parent.childCount; i++) {
          const child = parent.child(i);
          if (child.type === 'identifier') return child.text;
        }
      }
      return `anonymous_${entity.start_line}`;
    }
    return `anonymous_${entity.start_line}`;
  }

  if (language === 'python') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier') return child.text;
    }
    return `anonymous_${entity.start_line}`;
  }

  if (language === 'java' || language === 'csharp') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier') return child.text;
    }
    return `anonymous_${entity.start_line}`;
  }

  // C and default
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
 * Extract class name from a class node.
 */
const get_class_name = (entity, language) => {
  const node = entity.node;

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

  if (language === 'go' && node.type === 'type_declaration') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_spec') {
        for (let j = 0; j < child.childCount; j++) {
          const grandchild = child.child(j);
          if (grandchild.type === 'type_identifier') return grandchild.text;
        }
      }
    }
  }

  const content = entity.content;
  const class_match = content.match(
    /(?:class|struct|interface|enum|type)\s+(\w+)/
  );
  if (class_match) return class_match[1];

  return `unknown_class_${entity.start_line}`;
};

/**
 * Extract struct name from a struct node.
 */
const get_struct_name = (entity, language) => {
  const node = entity.node;

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

  if (language === 'go' && node.type === 'type_declaration') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_spec') {
        for (let j = 0; j < child.childCount; j++) {
          const grandchild = child.child(j);
          if (grandchild.type === 'type_identifier') return grandchild.text;
        }
      }
    }
  }

  const content = entity.content;
  const struct_match = content.match(/struct\s+(\w+)/);
  if (struct_match) return struct_match[1];

  return `unknown_struct_${entity.start_line}`;
};

/**
 * Parse a single file and extract all data.
 */
const parse_file = async (absolute_filename, relative_filename, project_id) => {
  try {
    const source = await readFile(absolute_filename, 'utf-8');
    const nodes = get_nodes_from_source(source, absolute_filename);
    const language = get_language_from_extension(absolute_filename);

    // Build comment index for O(1) lookup
    const comment_by_end_line = new Map();
    for (const comment of nodes.comment) {
      comment_by_end_line.set(comment.end_line, comment);
    }

    // Prepare entities
    const entities = [];
    for (const entity of nodes.function_definition) {
      const name = get_function_name(entity, language);
      if (!name || name.startsWith('unknown_')) continue;

      const new_entity = {
        project_id: project_id,
        symbol: name,
        type: 'function',
        language,
        filename: relative_filename,
        start_line: entity.start_line,
        end_line: entity.end_line,
        start_position: entity.start_position,
        end_position: entity.end_position,
        parameters: null,
        source: entity.content,
        comment: null,
        return_type: 'void'
      };

      const comment_entity = comment_by_end_line.get(new_entity.start_line - 1);
      if (comment_entity) new_entity.comment = comment_entity.content;

      for (const param of nodes.parameter_list) {
        if (
          param.start_line >= new_entity.start_line &&
          param.end_line <= new_entity.end_line
        ) {
          new_entity.parameters = param.content.replace(/\s+/g, ' ');
          break;
        }
      }

      const return_type = get_return_type_from_function(entity, language);
      new_entity.return_type = return_type;

      entities.push(new_entity);
    }

    // Process class definitions
    if (nodes.class_definition) {
      for (const entity of nodes.class_definition) {
        const name = get_class_name(entity, language);
        if (!name || name.startsWith('unknown_class_')) continue;

        const new_entity = {
          project_id: project_id,
          symbol: name,
          type: 'class',
          language,
          filename: relative_filename,
          start_line: entity.start_line,
          end_line: entity.end_line,
          start_position: entity.start_position,
          end_position: entity.end_position,
          parameters: null,
          source: entity.content,
          comment: null,
          return_type: null
        };

        const comment_entity = comment_by_end_line.get(
          new_entity.start_line - 1
        );
        if (comment_entity) new_entity.comment = comment_entity.content;

        entities.push(new_entity);
      }
    }

    // Process struct definitions
    if (nodes.struct_definition) {
      for (const entity of nodes.struct_definition) {
        const name = get_struct_name(entity, language);
        if (!name || name.startsWith('unknown_struct_')) continue;

        const new_entity = {
          project_id: project_id,
          symbol: name,
          type: 'struct',
          language,
          filename: relative_filename,
          start_line: entity.start_line,
          end_line: entity.end_line,
          start_position: entity.start_position,
          end_position: entity.end_position,
          parameters: null,
          source: entity.content,
          comment: null,
          return_type: null
        };

        const comment_entity = comment_by_end_line.get(
          new_entity.start_line - 1
        );
        if (comment_entity) new_entity.comment = comment_entity.content;

        entities.push(new_entity);
      }
    }

    // Collect call expressions
    const functionCalls = nodes.call_expression.map((node) => ({
      content: node.content,
      start_line: node.start_line,
      filename: relative_filename
    }));

    // Collect comments
    const comments = nodes.comment.map((node) => ({
      content: node.content,
      end_line: node.end_line,
      filename: relative_filename
    }));

    // Collect symbol references
    const identifiers = get_all_identifiers_from_source(
      source,
      relative_filename
    );
    const symbolRefs = identifiers.map((ref) => ({
      project_id: project_id,
      symbol: ref.symbol,
      symbol_type: ref.symbol_type,
      definition_entity_id: null,
      filename: ref.filename,
      line: ref.line,
      column_start: ref.column_start,
      column_end: ref.column_end,
      context: ref.context,
      is_definition: ref.is_definition,
      is_write: ref.is_write
    }));

    // Collect inheritance info
    const inheritance_infos = extract_inheritance_from_source(
      source,
      relative_filename
    );
    const inheritance = [];
    for (const class_info of inheritance_infos) {
      if (class_info.relationships.length > 0) {
        inheritance.push({
          class_name: class_info.class_name,
          filename: class_info.filename,
          is_abstract: class_info.is_abstract,
          relationships: class_info.relationships
        });
      }
    }

    return {
      success: true,
      filename: relative_filename,
      source,
      entities,
      functionCalls,
      comments,
      symbolRefs,
      inheritance
    };
  } catch (error) {
    return {
      success: false,
      filename: relative_filename,
      error: error.message
    };
  }
};

// Handle messages from parent
parentPort.on('message', async (msg) => {
  if (msg.type === 'parse') {
    const result = await parse_file(
      msg.absoluteFilename,
      msg.relativeFilename,
      msg.projectId
    );
    result.taskId = msg.taskId;
    parentPort.postMessage(result);
  }
});
