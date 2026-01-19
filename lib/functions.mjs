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
import { get_inheritance_handler } from './inheritance/handlers.mjs';

const exec = promisify(child_exec);

import Parser from 'tree-sitter';
import C from 'tree-sitter-c';
import Cpp from 'tree-sitter-cpp';
import JavaScript from 'tree-sitter-javascript';
import Python from 'tree-sitter-python';
import Java from 'tree-sitter-java';
import CSharp from 'tree-sitter-c-sharp';
import TypeScript from 'tree-sitter-typescript';
import Rust from 'tree-sitter-rust';
import Swift from 'tree-sitter-swift';
import Ruby from 'tree-sitter-ruby';
import PHP from 'tree-sitter-php';
import Zig from '@tree-sitter-grammars/tree-sitter-zig';
import Go from 'tree-sitter-go';

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
      'parameter_list',
      'struct_specifier',
      'union_specifier',
      'enum_specifier',
      'type_definition',
      // Reference tracking types
      'declaration',
      'field_declaration',
      'preproc_def',
      'preproc_function_def'
    ],
    functionTypes: ['function_definition'],
    parameterTypes: ['parameter_list'],
    classTypes: [],
    structTypes: [
      'struct_specifier',
      'union_specifier',
      'enum_specifier',
      'type_definition'
    ],
    referenceTypes: [
      'declaration',
      'field_declaration',
      'preproc_def',
      'preproc_function_def',
      'parameter_declaration'
    ],
    identifierTypes: ['identifier', 'type_identifier', 'field_identifier'],
    // C doesn't have class inheritance, but structs can be "inherited" via embedding
    inheritanceTypes: []
  },
  cpp: {
    parser: Cpp,
    types: [
      'call_expression',
      'comment',
      'function_definition',
      'function_declarator',
      'primitive_type',
      'parameter_declaration',
      'parameter_list',
      'struct_specifier',
      'union_specifier',
      'enum_specifier',
      'type_definition',
      'class_specifier',
      'field_declaration',
      'template_declaration',
      'namespace_definition',
      // Reference tracking types
      'declaration',
      'preproc_def',
      'preproc_function_def',
      // Inheritance tracking
      'base_class_clause'
    ],
    functionTypes: ['function_definition'],
    parameterTypes: ['parameter_list'],
    classTypes: ['class_specifier'],
    structTypes: [
      'struct_specifier',
      'union_specifier',
      'enum_specifier',
      'type_definition'
    ],
    referenceTypes: [
      'declaration',
      'field_declaration',
      'preproc_def',
      'preproc_function_def',
      'parameter_declaration'
    ],
    identifierTypes: [
      'identifier',
      'type_identifier',
      'field_identifier',
      'namespace_identifier'
    ],
    inheritanceTypes: ['base_class_clause']
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
      'identifier',
      'class_declaration',
      'class',
      // Inheritance tracking
      'class_heritage',
      'extends_clause'
    ],
    functionTypes: [
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition'
    ],
    parameterTypes: ['formal_parameters'],
    classTypes: ['class_declaration', 'class'],
    structTypes: [],
    identifierTypes: [
      'identifier',
      'property_identifier',
      'shorthand_property_identifier'
    ],
    inheritanceTypes: ['class_heritage', 'extends_clause']
  },
  python: {
    parser: Python,
    types: [
      'call',
      'comment',
      'function_definition',
      'parameters',
      'identifier',
      'decorated_definition',
      'class_definition',
      // Inheritance tracking - Python uses argument_list for base classes
      'argument_list'
    ],
    functionTypes: ['function_definition'],
    parameterTypes: ['parameters'],
    classTypes: ['class_definition'],
    structTypes: [],
    identifierTypes: ['identifier'],
    inheritanceTypes: ['argument_list'] // In class_definition context
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
      'identifier',
      'class_declaration',
      'interface_declaration',
      'enum_declaration',
      'record_declaration',
      // Inheritance tracking
      'superclass',
      'super_interfaces'
    ],
    functionTypes: ['method_declaration', 'constructor_declaration'],
    parameterTypes: ['formal_parameters'],
    classTypes: [
      'class_declaration',
      'interface_declaration',
      'enum_declaration',
      'record_declaration'
    ],
    structTypes: [],
    identifierTypes: ['identifier', 'type_identifier'],
    inheritanceTypes: ['superclass', 'super_interfaces']
  },
  csharp: {
    parser: CSharp,
    types: [
      'invocation_expression',
      'comment',
      'method_declaration',
      'constructor_declaration',
      'parameter_list',
      'identifier',
      'class_declaration',
      'struct_declaration',
      'interface_declaration',
      'enum_declaration',
      'record_declaration',
      // Inheritance tracking
      'base_list'
    ],
    functionTypes: ['method_declaration', 'constructor_declaration'],
    parameterTypes: ['parameter_list'],
    classTypes: [
      'class_declaration',
      'interface_declaration',
      'record_declaration'
    ],
    structTypes: ['struct_declaration', 'enum_declaration'],
    identifierTypes: ['identifier'],
    inheritanceTypes: ['base_list']
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
      'type_annotation',
      'class_declaration',
      'class',
      'interface_declaration',
      'type_alias_declaration',
      // Inheritance tracking
      'class_heritage',
      'extends_clause',
      'implements_clause',
      'extends_type_clause'
    ],
    functionTypes: [
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition'
    ],
    parameterTypes: ['formal_parameters'],
    classTypes: ['class_declaration', 'class', 'interface_declaration'],
    structTypes: ['type_alias_declaration'],
    identifierTypes: [
      'identifier',
      'property_identifier',
      'shorthand_property_identifier',
      'type_identifier'
    ],
    inheritanceTypes: [
      'class_heritage',
      'extends_clause',
      'implements_clause',
      'extends_type_clause'
    ]
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
      'type_annotation',
      'class_declaration',
      'class',
      'interface_declaration',
      'type_alias_declaration',
      // Inheritance tracking
      'class_heritage',
      'extends_clause',
      'implements_clause',
      'extends_type_clause'
    ],
    functionTypes: [
      'function_declaration',
      'function_expression',
      'arrow_function',
      'method_definition'
    ],
    parameterTypes: ['formal_parameters'],
    classTypes: ['class_declaration', 'class', 'interface_declaration'],
    structTypes: ['type_alias_declaration'],
    identifierTypes: [
      'identifier',
      'property_identifier',
      'shorthand_property_identifier',
      'type_identifier'
    ],
    inheritanceTypes: [
      'class_heritage',
      'extends_clause',
      'implements_clause',
      'extends_type_clause'
    ]
  },
  rust: {
    parser: Rust,
    types: [
      'call_expression',
      'line_comment',
      'block_comment',
      'function_item',
      'impl_item',
      'parameters',
      'identifier',
      'macro_invocation',
      'struct_item',
      'enum_item',
      'trait_item',
      'type_item',
      // Inheritance tracking
      'trait_bounds',
      'where_clause'
    ],
    functionTypes: ['function_item'],
    parameterTypes: ['parameters'],
    classTypes: ['trait_item', 'impl_item'],
    structTypes: ['struct_item', 'enum_item', 'type_item'],
    identifierTypes: ['identifier', 'type_identifier', 'field_identifier'],
    inheritanceTypes: ['trait_bounds', 'where_clause', 'impl_item']
  },
  swift: {
    parser: Swift,
    types: [
      'call_expression',
      'comment',
      'multiline_comment',
      'function_declaration',
      'parameter_clause',
      'identifier',
      'class_declaration',
      'struct_declaration',
      'enum_declaration',
      'protocol_declaration',
      // Inheritance tracking
      'inheritance_clause',
      'type_inheritance_clause'
    ],
    functionTypes: ['function_declaration'],
    parameterTypes: ['parameter_clause'],
    classTypes: ['class_declaration', 'protocol_declaration'],
    structTypes: ['struct_declaration', 'enum_declaration'],
    identifierTypes: ['identifier', 'type_identifier'],
    inheritanceTypes: ['inheritance_clause', 'type_inheritance_clause']
  },
  ruby: {
    parser: Ruby,
    types: [
      'call',
      'comment',
      'method',
      'singleton_method',
      'method_parameters',
      'identifier',
      'class',
      'module',
      'singleton_class',
      // Inheritance tracking
      'superclass'
    ],
    functionTypes: ['method', 'singleton_method'],
    parameterTypes: ['method_parameters'],
    classTypes: ['class', 'module', 'singleton_class'],
    structTypes: [],
    identifierTypes: [
      'identifier',
      'constant',
      'instance_variable',
      'class_variable',
      'global_variable'
    ],
    inheritanceTypes: ['superclass']
  },
  php: {
    parser: PHP.php,
    types: [
      'function_call_expression',
      'comment',
      'function_definition',
      'method_declaration',
      'formal_parameters',
      'name',
      'class_declaration',
      'interface_declaration',
      'trait_declaration',
      'enum_declaration',
      // Inheritance tracking
      'base_clause',
      'class_interface_clause'
    ],
    functionTypes: ['function_definition', 'method_declaration'],
    parameterTypes: ['formal_parameters'],
    classTypes: [
      'class_declaration',
      'interface_declaration',
      'trait_declaration'
    ],
    structTypes: ['enum_declaration'],
    identifierTypes: ['name', 'variable_name'],
    inheritanceTypes: ['base_clause', 'class_interface_clause']
  },
  zig: {
    parser: Zig,
    types: [
      'call_expression',
      'line_comment',
      'doc_comment',
      'container_doc_comment',
      'fn_decl',
      'parameters',
      'identifier',
      'container_decl'
    ],
    functionTypes: ['fn_decl'],
    parameterTypes: ['parameters'],
    classTypes: [],
    structTypes: ['container_decl'],
    identifierTypes: ['identifier', 'builtin_identifier'],
    // Zig doesn't have traditional class inheritance
    inheritanceTypes: []
  },
  go: {
    parser: Go,
    types: [
      'call_expression',
      'comment',
      'function_declaration',
      'method_declaration',
      'parameter_list',
      'identifier',
      'type_declaration',
      'struct_type',
      'interface_type',
      // Go uses struct embedding for "inheritance"
      'field_declaration'
    ],
    functionTypes: ['function_declaration', 'method_declaration'],
    parameterTypes: ['parameter_list'],
    classTypes: ['interface_type'],
    structTypes: ['type_declaration', 'struct_type'],
    identifierTypes: [
      'identifier',
      'type_identifier',
      'field_identifier',
      'package_identifier'
    ],
    // Go embeds types in structs for composition (closest to inheritance)
    inheritanceTypes: ['field_declaration'] // Anonymous field_declaration = embedding
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
      return 'c';
    case '.cpp':
    case '.hpp':
    case '.cc':
    case '.cxx':
    case '.hxx':
    case '.h': // Treat .h as C++ by default (more common in modern codebases)
      return 'cpp';
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
    case '.rs':
      return 'rust';
    case '.swift':
      return 'swift';
    case '.rb':
    case '.rake':
    case '.gemspec':
      return 'ruby';
    case '.php':
    case '.phtml':
    case '.php3':
    case '.php4':
    case '.php5':
    case '.phps':
      return 'php';
    case '.zig':
      return 'zig';
    case '.go':
      return 'go';
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
  const node_types = types || config.types;

  // Convert arrays to Sets for O(1) lookup instead of O(n) indexOf/includes
  const node_type_set = new Set(node_types);
  const function_type_set = new Set(config.functionTypes || []);
  const parameter_type_set = new Set(config.parameterTypes || []);
  const class_type_set = new Set(config.classTypes || []);
  const struct_type_set = new Set(config.structTypes || []);

  const result = {};

  const tree = create_tree_for_language(source, language);

  for (const type of node_types) {
    result[type] = [];
  }

  // Normalize results to common keys for cross-language compatibility
  result.function_definition = result.function_definition || [];
  result.call_expression = result.call_expression || [];
  result.comment = result.comment || [];
  result.parameter_list = result.parameter_list || [];
  result.class_definition = result.class_definition || [];
  result.struct_definition = result.struct_definition || [];

  let visited_children = false;
  let cursor = tree.walk();

  while (true) {
    if (!visited_children) {
      const node = cursor.currentNode;
      const node_type = node.type;

      if (node_type_set.has(node_type)) {
        const node_data = {
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
          type: node_type,
          filename,
          node // Store reference to the Tree-Sitter node for advanced traversal
        };

        result[node_type].push(node_data);

        // Normalize function types to function_definition for cross-language compatibility
        if (
          function_type_set.has(node_type) &&
          node_type !== 'function_definition'
        ) {
          result.function_definition.push(node_data);
        }

        // Normalize call types
        if (node_type === 'call' && language === 'python') {
          result.call_expression.push(node_data);
        } else if (node_type === 'method_invocation' && language === 'java') {
          result.call_expression.push(node_data);
        } else if (
          node_type === 'invocation_expression' &&
          language === 'csharp'
        ) {
          result.call_expression.push(node_data);
        }

        // Normalize comment types for Java (has block_comment and line_comment)
        if (
          (node_type === 'block_comment' || node_type === 'line_comment') &&
          language === 'java'
        ) {
          result.comment.push(node_data);
        }

        // Normalize parameter types
        if (
          parameter_type_set.has(node_type) &&
          node_type !== 'parameter_list'
        ) {
          result.parameter_list.push(node_data);
        }

        // Normalize class types to class_definition for cross-language compatibility
        if (class_type_set.has(node_type) && node_type !== 'class_definition') {
          result.class_definition.push(node_data);
        }

        // Normalize struct types to struct_definition for cross-language compatibility
        if (
          struct_type_set.has(node_type) &&
          node_type !== 'struct_definition'
        ) {
          result.struct_definition.push(node_data);
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
 * @param {object} func_def - A function entity with a `node` property
 * @param {string} language - The language ('c', 'javascript', 'python', 'java', 'csharp', 'pascal')
 * @returns {string} The return type string
 */
const get_return_type_from_function = (func_def, language = 'c') => {
  if (!func_def || !func_def.node) {
    return language === 'c' ? 'void' : 'function';
  }

  const node = func_def.node;

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
        if (
          child.text === 'public' ||
          child.text === 'private' ||
          child.text === 'protected' ||
          child.text === 'static' ||
          child.text === 'async' ||
          child.text === 'virtual' ||
          child.text === 'override' ||
          child.text === 'abstract'
        ) {
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
          const type_child = child.child(j);
          if (type_child.type !== ':') {
            return type_child.text;
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
  const return_type_parts = [];

  // Iterate through children until we hit the declarator or compound_statement
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    const child_type = child.type;

    // Stop when we reach the declarator or function body
    if (
      child_type === 'function_declarator' ||
      child_type === 'pointer_declarator' ||
      child_type === 'compound_statement'
    ) {
      break;
    }

    // Collect type-related nodes
    if (
      child_type === 'primitive_type' ||
      child_type === 'sized_type_specifier' ||
      child_type === 'struct_specifier' ||
      child_type === 'union_specifier' ||
      child_type === 'enum_specifier' ||
      child_type === 'type_qualifier' ||
      child_type === 'type_identifier' || // For typedef'd types like size_t
      child_type === 'storage_class_specifier' // static, extern, etc.
    ) {
      return_type_parts.push(child.text);
    }
  }

  // If we found type parts, join them; otherwise default to void
  if (return_type_parts.length > 0) {
    return return_type_parts.join(' ');
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

/**
 * Extract type identifiers from a tree-sitter node recursively.
 * @param {Object} node - Tree-sitter node
 * @returns {string[]} Array of type identifier names
 */
const extract_type_identifiers = (node) => {
  const types = [];

  const traverse = (n) => {
    if (!n) return;

    // type_identifier is used for custom types (structs, classes, typedefs)
    if (n.type === 'type_identifier') {
      types.push(n.text);
    }
    // struct_specifier/union_specifier may have embedded type names
    else if (n.type === 'struct_specifier' || n.type === 'union_specifier') {
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child.type === 'type_identifier' || child.type === 'identifier') {
          types.push(child.text);
        }
      }
    }

    // Recurse into children
    for (let i = 0; i < n.childCount; i++) {
      traverse(n.child(i));
    }
  };

  traverse(node);
  return types;
};

/**
 * Determine the reference type based on the node type and context.
 * @param {Object} node - Tree-sitter node
 * @returns {string} Reference type ('variable', 'parameter', 'field', 'typedef', 'macro')
 */
const get_reference_type = (node) => {
  switch (node.type) {
    case 'declaration':
      return 'variable';
    case 'parameter_declaration':
      return 'parameter';
    case 'field_declaration':
      return 'field';
    case 'type_definition':
      return 'typedef';
    case 'preproc_def':
    case 'preproc_function_def':
      return 'macro';
    default:
      return 'variable';
  }
};

/**
 * Determine the symbol type based on the parent node context.
 * @param {Object} node - The identifier node
 * @param {string} language - The language identifier
 * @returns {Object} Object with symbol_type and is_definition, is_write flags
 */
const get_symbol_context = (node, language) => {
  const parent = node.parent;
  if (!parent) {
    return { symbol_type: 'variable', is_definition: false, is_write: false };
  }

  const parent_type = parent.type;
  const config = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.c;

  // Check if this is a function/method definition
  const matched_func_type = config.functionTypes.find(
    (ft) => parent_type === ft || parent.parent?.type === ft
  );
  if (matched_func_type) {
    // Check if this identifier is the function name
    const func_node =
      parent_type === matched_func_type ? parent : parent.parent;
    if (func_node) {
      // For function declarations, the first identifier child is usually the name
      for (let i = 0; i < func_node.childCount; i++) {
        const child = func_node.child(i);
        if (child.type === node.type && child.text === node.text) {
          return {
            symbol_type: 'function',
            is_definition: true,
            is_write: false
          };
        }
        // Stop after declarator/name nodes
        if (
          child.type.includes('declarator') ||
          child.type === 'name' ||
          child.type === 'identifier' ||
          child.type === 'formal_parameters' ||
          child.type === 'parameters' ||
          child.type === 'parameter_list'
        ) {
          break;
        }
      }
    }
  }

  // Check if this is a class/struct definition
  if (
    config.classTypes?.includes(parent_type) ||
    config.structTypes?.includes(parent_type)
  ) {
    return { symbol_type: 'class', is_definition: true, is_write: false };
  }

  // Check for parameter definitions
  if (
    config.parameterTypes?.includes(parent_type) ||
    parent_type === 'parameter' ||
    parent_type === 'required_parameter' ||
    parent_type === 'optional_parameter' ||
    parent_type === 'parameter_declaration'
  ) {
    return { symbol_type: 'parameter', is_definition: true, is_write: false };
  }

  // Check for variable declarations
  const declaration_types = [
    'variable_declaration',
    'variable_declarator',
    'declaration',
    'lexical_declaration',
    'const_declaration',
    'let_declaration',
    'var_declaration',
    'assignment_expression',
    'assignment',
    'augmented_assignment'
  ];

  if (declaration_types.includes(parent_type)) {
    // Check if this is the left-hand side (definition/write) or right-hand side (read)
    const first_child = parent.child(0);
    if (
      first_child &&
      (first_child.id === node.id ||
        (first_child.type === 'identifier' && first_child.text === node.text))
    ) {
      return { symbol_type: 'variable', is_definition: true, is_write: true };
    }
    return { symbol_type: 'variable', is_definition: false, is_write: false };
  }

  // Check for field access
  if (
    parent_type === 'member_expression' ||
    parent_type === 'field_expression' ||
    parent_type === 'attribute' ||
    parent_type === 'field_access'
  ) {
    return { symbol_type: 'field', is_definition: false, is_write: false };
  }

  // Check for imports
  if (
    parent_type === 'import_statement' ||
    parent_type === 'import_specifier' ||
    parent_type === 'import_clause' ||
    parent_type === 'import_declaration' ||
    parent_type === 'import_from_statement'
  ) {
    return { symbol_type: 'import', is_definition: true, is_write: false };
  }

  // Check for function calls
  if (
    parent_type === 'call_expression' ||
    parent_type === 'call' ||
    parent_type === 'method_invocation' ||
    parent_type === 'invocation_expression'
  ) {
    // The function being called is usually the first child
    const first_child = parent.child(0);
    if (
      first_child &&
      (first_child.id === node.id ||
        (first_child.type === node.type && first_child.text === node.text))
    ) {
      return { symbol_type: 'function', is_definition: false, is_write: false };
    }
  }

  // Default to variable reference
  return { symbol_type: 'variable', is_definition: false, is_write: false };
};

/**
 * Extract all identifiers from source code for cross-reference tracking.
 * Returns every occurrence of every identifier with context information.
 * @param {string} source - The source code to parse
 * @param {string} filename - Filename used to determine language
 * @returns {Object[]} Array of identifier objects with symbol, type, location, and context
 */
const get_all_identifiers_from_source = (source, filename) => {
  const language = get_language_from_filename(filename);
  const config = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.c;

  // Check if this language supports identifier extraction
  if (!config.identifierTypes || config.identifierTypes.length === 0) {
    return [];
  }

  const identifiers = [];
  const source_lines = source.split('\n');
  const identifier_type_set = new Set(config.identifierTypes);

  const tree = create_tree_for_language(source, language);

  let visited_children = false;
  let cursor = tree.walk();

  while (true) {
    if (!visited_children) {
      const node = cursor.currentNode;

      // Check if this is an identifier node type
      if (identifier_type_set.has(node.type)) {
        const symbol = node.text;

        // Skip empty identifiers or very short ones that are likely noise
        if (symbol && symbol.length > 0) {
          const line = node.startPosition.row + 1;
          const column_start = node.startPosition.column;
          const column_end = node.endPosition.column;
          const context = source_lines[node.startPosition.row]?.trim() || '';

          // Determine symbol type and definition status from context
          const { symbol_type, is_definition, is_write } = get_symbol_context(
            node,
            language
          );

          identifiers.push({
            symbol,
            symbol_type,
            filename,
            line,
            column_start,
            column_end,
            context,
            is_definition,
            is_write,
            node_type: node.type
          });
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

  return identifiers;
};

/**
 * Extract inheritance information from a class/struct definition node.
 * Returns parent classes, interfaces, and the relationship type.
 * Delegates to language-specific handlers in lib/inheritance/handlers.mjs.
 * @param {Object} class_node - Tree-sitter node for a class/struct definition
 * @param {string} language - The language identifier
 * @returns {Object[]} Array of inheritance relationships with parent_symbol and relationship_type
 */
const extract_inheritance_from_node = (class_node, language) => {
  const config = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.c;

  // Check if language supports inheritance
  if (!config.inheritanceTypes || config.inheritanceTypes.length === 0) {
    return [];
  }

  // Get the language-specific handler
  const handler = get_inheritance_handler(language);
  if (!handler) {
    return [];
  }

  // Delegate to the handler
  return handler(class_node);
};

/**
 * Extract all class/struct definitions with their inheritance info from source code.
 * @param {string} source - The source code to parse
 * @param {string} filename - Filename used to determine language
 * @returns {Object[]} Array of class definitions with inheritance relationships
 */
const extract_inheritance_from_source = (source, filename) => {
  const language = get_language_from_filename(filename);
  const config = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.c;

  const results = [];
  const source_lines = source.split('\n');

  // Get all class types for this language
  const class_type_set = new Set([
    ...(config.classTypes || []),
    ...(config.structTypes || [])
  ]);

  if (class_type_set.size === 0) {
    return results;
  }

  const tree = create_tree_for_language(source, language);

  let visited_children = false;
  let cursor = tree.walk();

  while (true) {
    if (!visited_children) {
      const node = cursor.currentNode;

      // Check if this is a class/struct definition
      if (class_type_set.has(node.type)) {
        // Extract the class name
        let class_name = null;
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (
            child.type === 'identifier' ||
            child.type === 'type_identifier' ||
            child.type === 'name' ||
            child.type === 'constant'
          ) {
            class_name = child.text;
            break;
          }
        }

        if (class_name) {
          const relationships = extract_inheritance_from_node(node, language);
          const line = node.startPosition.row + 1;
          const context = source_lines[node.startPosition.row]?.trim() || '';

          // Determine if this is abstract (language-specific)
          let is_abstract = false;
          if (language === 'java' || language === 'csharp') {
            is_abstract = context.includes('abstract ');
          }
          if (language === 'typescript' || language === 'tsx') {
            is_abstract = context.includes('abstract ');
          }

          results.push({
            class_name: class_name,
            class_type: node.type,
            filename,
            line,
            context,
            is_abstract: is_abstract,
            relationships
          });
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

  return results;
};

export {
  create_tree,
  get_nodes_from_source,
  get_source_from_position,
  get_parameters_from_position,
  get_type_from_position,
  get_return_type_from_function,
  get_all_identifiers_from_source,
  extract_inheritance_from_source,
  get_language_from_filename,
  LANGUAGE_CONFIG
};
