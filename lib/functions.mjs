'use strict';

/**
 * @fileoverview Tree-sitter based code parsing and AST operations.
 * Supports C, JavaScript, and Python languages for extracting
 * functions, comments, call expressions, and other code structures.
 * @module lib/functions
 */

import { readFile } from 'fs/promises';
import { promisify } from 'util';
import { exec as child_exec } from 'child_process';
import { text_at_position } from './sourcecode.mjs';
import { extname } from 'path';

const exec = promisify(child_exec);

import Parser from 'tree-sitter';
import C from 'tree-sitter-c';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import Java from 'tree-sitter-java';
import CSharp from 'tree-sitter-c-sharp';
import TypeScript from 'tree-sitter-typescript';

// Language configurations for parsing
const LANGUAGE_CONFIG = {
  c: {
    parser: C,
    types: [
      'call_expression',
      'comment',
      'function_definition',
      'function_declarator',
      'primitive_type',
      'parameter_declaration',
      'parameter_list'
    ],
    functionTypes: ['function_definition'],
    parameterTypes: ['parameter_list']
  },
  javascript: {
    parser: JavaScript,
    types: [
      'call_expression',
      'comment',
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition',
      'formal_parameters',
      'identifier'
    ],
    functionTypes: [
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition'
    ],
    parameterTypes: ['formal_parameters']
  },
  python: {
    parser: Python,
    types: [
      'call',
      'comment',
      'function_definition',
      'parameters',
      'identifier',
      'decorated_definition'
    ],
    functionTypes: ['function_definition'],
    parameterTypes: ['parameters']
  },
  java: {
    parser: Java,
    types: [
      'method_invocation',
      'comment',
      'block_comment',
      'line_comment',
      'method_declaration',
      'constructor_declaration',
      'formal_parameters',
      'identifier'
    ],
    functionTypes: ['method_declaration', 'constructor_declaration'],
    parameterTypes: ['formal_parameters']
  },
  csharp: {
    parser: CSharp,
    types: [
      'invocation_expression',
      'comment',
      'method_declaration',
      'constructor_declaration',
      'parameter_list',
      'identifier'
    ],
    functionTypes: ['method_declaration', 'constructor_declaration'],
    parameterTypes: ['parameter_list']
  },
  typescript: {
    parser: TypeScript.typescript,
    types: [
      'call_expression',
      'comment',
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition',
      'formal_parameters',
      'identifier',
      'type_annotation'
    ],
    functionTypes: [
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition'
    ],
    parameterTypes: ['formal_parameters']
  },
  tsx: {
    parser: TypeScript.tsx,
    types: [
      'call_expression',
      'comment',
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition',
      'formal_parameters',
      'identifier',
      'type_annotation'
    ],
    functionTypes: [
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition'
    ],
    parameterTypes: ['formal_parameters']
  }
};

/**
 * Determine the programming language from a filename's extension.
 * @param {string} filename - The filename to analyze
 * @returns {string} Language identifier ('c', 'javascript', 'python', 'java', 'csharp', 'pascal')
 */
const get_language_from_filename = (filename) => {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case '.c':
    case '.h':
    case '.cpp':
    case '.hpp':
    case '.cc':
      return 'c';
    case '.js':
    case '.mjs':
    case '.jsx':
      return 'javascript';
    case '.py':
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
      return 'c'; // Default to C
  }
};

/**
 * Parse source code and extract nodes of specified types.
 * Results are normalized across languages for cross-language compatibility.
 * @param {string} source - The source code to parse
 * @param {string} filename - Filename used to determine language
 * @param {string[]} [types=null] - Node types to extract (null for language defaults)
 * @returns {Object} Object with arrays of nodes keyed by type (function_definition, call_expression, comment, parameter_list)
 */
const get_nodes_from_source = (source, filename, types = null) => {
  const language = get_language_from_filename(filename);
  const config = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.c;

  // Use provided types or default to language-specific types
  const nodeTypes = types || config.types;

  const result = {};

  const tree = create_tree_for_language(source, language);

  for (const type of nodeTypes) {
    result[type] = [];
  }

  // Normalize results to common keys for cross-language compatibility
  result.function_definition = result.function_definition || [];
  result.call_expression = result.call_expression || [];
  result.comment = result.comment || [];
  result.parameter_list = result.parameter_list || [];

  let visited_children = false;
  let cursor = tree.walk();

  while (true) {
    if (!visited_children) {
      const node = cursor.currentNode;
      const idx = nodeTypes.indexOf(node.type);
      if (idx !== -1) {
        const nodeData = {
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
        };

        result[nodeTypes[idx]].push(nodeData);

        // Normalize function types to function_definition for cross-language compatibility
        if (
          config.functionTypes.includes(node.type) &&
          node.type !== 'function_definition'
        ) {
          result.function_definition.push(nodeData);
        }

        // Normalize call types
        if (node.type === 'call' && language === 'python') {
          result.call_expression = result.call_expression || [];
          result.call_expression.push(nodeData);
        }
        if (node.type === 'method_invocation' && language === 'java') {
          result.call_expression = result.call_expression || [];
          result.call_expression.push(nodeData);
        }
        if (node.type === 'invocation_expression' && language === 'csharp') {
          result.call_expression = result.call_expression || [];
          result.call_expression.push(nodeData);
        }

        // Normalize comment types for Java (has block_comment and line_comment)
        if ((node.type === 'block_comment' || node.type === 'line_comment') && language === 'java') {
          result.comment = result.comment || [];
          result.comment.push(nodeData);
        }

        // Normalize parameter types
        if (
          config.parameterTypes.includes(node.type) &&
          node.type !== 'parameter_list'
        ) {
          result.parameter_list.push(nodeData);
        }
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
 * Extract the return type from a function node by examining its children.
 * Supports C, JavaScript, Python, Java, C#, and Pascal.
 *
 * @param {object} funcDef - A function entity with a `node` property
 * @param {string} language - The language ('c', 'javascript', 'python', 'java', 'csharp', 'pascal')
 * @returns {string} The return type string
 */
const get_return_type_from_function = (funcDef, language = 'c') => {
  if (!funcDef || !funcDef.node) {
    return language === 'c' ? 'void' : 'function';
  }

  const node = funcDef.node;

  // JavaScript: functions don't have explicit return types (unless using TypeScript)
  if (language === 'javascript') {
    // Check if it's an arrow function, method, etc.
    switch (node.type) {
      case 'arrow_function':
        return 'arrow_function';
      case 'function_declaration':
      case 'function_expression':
        return 'function';
      case 'method_definition':
        return 'method';
      default:
        return 'function';
    }
  }

  // Python: check for type annotations (-> type)
  if (language === 'python') {
    // Look for return type annotation
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type') {
        return child.text;
      }
    }
    return 'def';
  }

  // Java: extract return type from method_declaration
  if (language === 'java') {
    // For constructors, return the class name (constructor type)
    if (node.type === 'constructor_declaration') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'identifier') {
          return child.text;
        }
      }
      return 'constructor';
    }
    // For methods, look for type nodes before the method name
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (
        child.type === 'void_type' ||
        child.type === 'integral_type' ||
        child.type === 'floating_point_type' ||
        child.type === 'boolean_type' ||
        child.type === 'type_identifier' ||
        child.type === 'generic_type' ||
        child.type === 'array_type'
      ) {
        return child.text;
      }
    }
    return 'void';
  }

  // C#: extract return type from method_declaration
  if (language === 'csharp') {
    // For constructors, return the class name
    if (node.type === 'constructor_declaration') {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'identifier') {
          return child.text;
        }
      }
      return 'constructor';
    }
    // For methods, look for predefined_type or type nodes
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (
        child.type === 'predefined_type' ||
        child.type === 'void_keyword' ||
        child.type === 'identifier' ||
        child.type === 'generic_name' ||
        child.type === 'array_type' ||
        child.type === 'nullable_type'
      ) {
        // Skip modifiers that might appear as identifiers
        if (child.text === 'public' || child.text === 'private' ||
            child.text === 'protected' || child.text === 'static' ||
            child.text === 'async' || child.text === 'virtual' ||
            child.text === 'override' || child.text === 'abstract') {
          continue;
        }
        return child.text;
      }
    }
    return 'void';
  }

  // TypeScript/TSX: check for return type annotations
  if (language === 'typescript' || language === 'tsx') {
    // TypeScript functions can have explicit return type annotations
    // Look for type_annotation node that follows the parameters
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'type_annotation') {
        // Get the type inside the annotation (skip the colon)
        for (let j = 0; j < child.childCount; j++) {
          const typeChild = child.child(j);
          if (typeChild.type !== ':') {
            return typeChild.text;
          }
        }
      }
    }
    // Fall back to JavaScript-style return types
    switch (node.type) {
      case 'arrow_function':
        return 'arrow_function';
      case 'function_declaration':
      case 'function_expression':
        return 'function';
      case 'method_definition':
        return 'method';
      default:
        return 'function';
    }
  }

  // C: Extract return type from function_definition
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

/**
 * Create a tree-sitter parse tree for C code.
 * @param {string} code - The C source code to parse
 * @returns {Object} Tree-sitter parse tree
 */
const create_tree = (code) => {
  const parser = new Parser();
  parser.setLanguage(C);

  const tree = parser.parse(code);

  return tree;
};

/**
 * Create a tree-sitter parse tree for a specific language.
 * @param {string} code - The source code to parse
 * @param {string} language - The language identifier ('c', 'javascript', 'python')
 * @returns {Object} Tree-sitter parse tree
 */
const create_tree_for_language = (code, language) => {
  const parser = new Parser();
  const config = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.c;
  parser.setLanguage(config.parser);

  const tree = parser.parse(code);

  return tree;
};

/**
 * Extract all unique node types from a tree-sitter parse tree.
 * Useful for discovering what node types are present in source code.
 * @param {Object} tree - Tree-sitter parse tree
 * @returns {string[]} Array of unique node type strings
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
 * Find a comment entity that ends on the line before the given start_line.
 * @param {Object[]} entities - Array of comment entities
 * @param {Object} params - Search parameters
 * @param {number} params.start_line - The line number to search before
 * @returns {Object|undefined} The matching comment entity, or undefined
 * @todo Add filename support for filtering
 */
const get_comment_from_position = (entities, { start_line }) => {
  for (const entity of entities) {
    if (entity.end_line === start_line - 1) {
      return entity;
    }
  }
};

/**
 * Find a source entity that starts at the given line.
 * @param {Object[]} entities - Array of source entities
 * @param {Object} params - Search parameters
 * @param {number} params.start_line - The line number to match
 * @returns {Object|undefined} The matching source entity, or undefined
 */
const get_source_from_position = (entities, { start_line }) => {
  for (const entity of entities) {
    if (entity.start_line === start_line) {
      return entity;
    }
  }
};

/**
 * Find a parameter entity that spans the given line range.
 * @param {Object[]} entities - Array of parameter entities
 * @param {Object} params - Search parameters
 * @param {number} params.start_line - The start line of the range
 * @param {number} params.end_line - The end line of the range
 * @returns {Object|undefined} The matching parameter entity, or undefined
 */
const get_parameters_from_position = (entities, { start_line, end_line }) => {
  for (const entity of entities) {
    if (entity.start_line <= start_line && entity.end_line >= end_line) {
      return entity;
    }
  }
};

/**
 * Find a type entity that starts at the given line.
 * @param {Object[]} entities - Array of type entities
 * @param {Object} params - Search parameters
 * @param {number} params.start_line - The line number to match
 * @returns {Object|undefined} The matching type entity, or undefined
 */
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
