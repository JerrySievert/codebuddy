'use strict';

import { readFile } from 'fs/promises';
import { promisify } from 'util';
import { exec as child_exec } from 'child_process';
import { text_at_position } from './sourcecode.mjs';

const exec = promisify(child_exec);

import Parser from 'tree-sitter';
import C from 'tree-sitter-c';

const get_nodes_from_source = (
  source,
  filename,
  types = [
    'call_expression',
    'comment',
    'function_definition',
    'function_declarator',
    'primitive_type',
    'parameter_declaration',
    'parameter_list'
  ]
) => {
  const result = {};

  const tree = create_tree(source);

  for (const type of types) {
    result[type] = [];
  }

  let visited_children = false;
  let cursor = tree.walk();

  while (true) {
    if (!visited_children) {
      const node = cursor.currentNode;
      const idx = types.indexOf(node.type);
      if (idx !== -1) {
        result[types[idx]].push({
          content: text_at_position({
            source,
            start_line: node.startPosition.row + 1,
            end_line: node.endPosition.row + 1,
            start_position: node.startPosition.column,
            end_position: node.endPosition.column
          }),
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          start_position: node.startPosition.column,
          end_position: node.endPosition.column,
          type: node.type,
          filename,
          node // Store reference to the Tree-Sitter node for advanced traversal
        });
      }

      if (!cursor.gotoFirstChild()) {
        visited_children = true;
      }
    } else if (cursor.gotoNextSibling()) {
      visited_children = false;
    } else if (!cursor.gotoParent()) {
      break;
    }
  }
  return result;
};

/**
 * Extract the return type from a function_definition node by examining its children.
 *
 * A function_definition in C has this structure:
 *   function_definition
 *     ├── [return type nodes] (primitive_type, sized_type_specifier, struct_specifier, type_qualifier, etc.)
 *     ├── [pointer_declarator or function_declarator]
 *     └── compound_statement
 *
 * The return type is everything before the declarator (function_declarator or pointer_declarator).
 *
 * @param {object} funcDef - A function_definition entity with a `node` property
 * @returns {string} The full return type string
 */
const get_return_type_from_function = (funcDef) => {
  if (!funcDef || !funcDef.node) {
    return 'void';
  }

  const node = funcDef.node;
  const returnTypeParts = [];

  // Iterate through children until we hit the declarator or compound_statement
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    const childType = child.type;

    // Stop when we reach the declarator or function body
    if (
      childType === 'function_declarator' ||
      childType === 'pointer_declarator' ||
      childType === 'compound_statement'
    ) {
      break;
    }

    // Collect type-related nodes
    if (
      childType === 'primitive_type' ||
      childType === 'sized_type_specifier' ||
      childType === 'struct_specifier' ||
      childType === 'union_specifier' ||
      childType === 'enum_specifier' ||
      childType === 'type_qualifier' ||
      childType === 'type_identifier' || // For typedef'd types like size_t
      childType === 'storage_class_specifier' // static, extern, etc.
    ) {
      returnTypeParts.push(child.text);
    }
  }

  // If we found type parts, join them; otherwise default to void
  if (returnTypeParts.length > 0) {
    return returnTypeParts.join(' ');
  }

  return 'void';
};

const create_tree = (code) => {
  const parser = new Parser();
  parser.setLanguage(C);

  const tree = parser.parse(code);

  return tree;
};

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

// TODO: These need to support filename.
const get_comment_from_position = (entities, { start_line }) => {
  for (const entity of entities) {
    if (entity.end_line === start_line - 1) {
      return entity;
    }
  }
};

const get_source_from_position = (entities, { start_line }) => {
  for (const entity of entities) {
    if (entity.start_line === start_line) {
      return entity;
    }
  }
};

const get_parameters_from_position = (entities, { start_line, end_line }) => {
  for (const entity of entities) {
    if (entity.start_line <= start_line && entity.end_line >= end_line) {
      return entity;
    }
  }
};

const get_type_from_position = (entities, { start_line }) => {
  for (const entity of entities) {
    if (entity.start_line === start_line) {
      return entity;
    }
  }
};

export {
  create_tree,
  get_nodes_from_source,
  get_types_from_tree,
  get_source_from_position,
  get_parameters_from_position,
  get_type_from_position,
  get_return_type_from_function
};
