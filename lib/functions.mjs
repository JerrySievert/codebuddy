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
          filename
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
  get_type_from_position
};
