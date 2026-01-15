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
    structTypes: ['struct_specifier', 'union_specifier', 'enum_specifier', 'type_definition'],
    referenceTypes: ['declaration', 'field_declaration', 'preproc_def', 'preproc_function_def', 'parameter_declaration'],
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
    structTypes: ['struct_specifier', 'union_specifier', 'enum_specifier', 'type_definition'],
    referenceTypes: ['declaration', 'field_declaration', 'preproc_def', 'preproc_function_def', 'parameter_declaration'],
    identifierTypes: ['identifier', 'type_identifier', 'field_identifier', 'namespace_identifier'],
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
    identifierTypes: ['identifier', 'property_identifier', 'shorthand_property_identifier'],
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
    inheritanceTypes: ['argument_list']  // In class_definition context
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
    classTypes: ['class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration'],
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
    classTypes: ['class_declaration', 'interface_declaration', 'record_declaration'],
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
    identifierTypes: ['identifier', 'property_identifier', 'shorthand_property_identifier', 'type_identifier'],
    inheritanceTypes: ['class_heritage', 'extends_clause', 'implements_clause', 'extends_type_clause']
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
    identifierTypes: ['identifier', 'property_identifier', 'shorthand_property_identifier', 'type_identifier'],
    inheritanceTypes: ['class_heritage', 'extends_clause', 'implements_clause', 'extends_type_clause']
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
    identifierTypes: ['identifier', 'constant', 'instance_variable', 'class_variable', 'global_variable'],
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
    classTypes: ['class_declaration', 'interface_declaration', 'trait_declaration'],
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
    identifierTypes: ['identifier', 'type_identifier', 'field_identifier', 'package_identifier'],
    // Go embeds types in structs for composition (closest to inheritance)
    inheritanceTypes: ['field_declaration']  // Anonymous field_declaration = embedding
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
    case '.h':  // Treat .h as C++ by default (more common in modern codebases)
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
  result.class_definition = result.class_definition || [];
  result.struct_definition = result.struct_definition || [];

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

        // Normalize class types to class_definition for cross-language compatibility
        if (
          config.classTypes &&
          config.classTypes.includes(node.type) &&
          node.type !== 'class_definition'
        ) {
          result.class_definition.push(nodeData);
        }

        // Normalize struct types to struct_definition for cross-language compatibility
        if (
          config.structTypes &&
          config.structTypes.includes(node.type) &&
          node.type !== 'struct_definition'
        ) {
          result.struct_definition.push(nodeData);
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
 * Extract type references from source code.
 * Finds declarations, parameters, and macros that reference struct/class types.
 * @param {string} source - The source code to parse
 * @param {string} filename - Filename used to determine language
 * @param {string[]} knownTypes - Array of known struct/class type names to match
 * @returns {Object[]} Array of reference objects with type_name, reference_type, line, context
 */
const get_type_references_from_source = (source, filename, knownTypes = []) => {
  const language = get_language_from_filename(filename);
  const config = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.c;

  // Only C/C++ currently support reference tracking
  if (!config.referenceTypes) {
    return [];
  }

  const references = [];
  const knownTypeSet = new Set(knownTypes);
  const sourceLines = source.split('\n');

  const tree = create_tree_for_language(source, language);

  let visited_children = false;
  let cursor = tree.walk();

  while (true) {
    if (!visited_children) {
      const node = cursor.currentNode;

      // Check if this is a reference-related node type
      if (config.referenceTypes.includes(node.type)) {
        // Extract type identifiers from this node
        const typeIds = extract_type_identifiers(node);

        for (const typeName of typeIds) {
          // Only track references to known struct/class types
          if (knownTypeSet.size === 0 || knownTypeSet.has(typeName)) {
            const line = node.startPosition.row + 1;
            const context = sourceLines[node.startPosition.row]?.trim() || '';

            references.push({
              type_name: typeName,
              reference_type: get_reference_type(node),
              line,
              filename,
              context
            });
          }
        }
      }

      // Special handling for #define macros that mention type names
      if (node.type === 'preproc_def' || node.type === 'preproc_function_def') {
        const content = node.text;
        for (const typeName of knownTypes) {
          // Check if the macro content mentions any known type
          if (content.includes(typeName)) {
            const line = node.startPosition.row + 1;
            const context = sourceLines[node.startPosition.row]?.trim() || '';

            // Avoid duplicates from the type_identifier extraction above
            const exists = references.some(
              (r) => r.type_name === typeName && r.line === line && r.reference_type === 'macro'
            );

            if (!exists) {
              references.push({
                type_name: typeName,
                reference_type: 'macro',
                line,
                filename,
                context
              });
            }
          }
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

  return references;
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

  const parentType = parent.type;
  const config = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.c;

  // Check if this is a function/method definition
  const matchedFuncType = config.functionTypes.find(ft => parentType === ft || parent.parent?.type === ft);
  if (matchedFuncType) {
    // Check if this identifier is the function name
    const funcNode = parentType === matchedFuncType ? parent : parent.parent;
    if (funcNode) {
      // For function declarations, the first identifier child is usually the name
      for (let i = 0; i < funcNode.childCount; i++) {
        const child = funcNode.child(i);
        if (child.type === node.type && child.text === node.text) {
          return { symbol_type: 'function', is_definition: true, is_write: false };
        }
        // Stop after declarator/name nodes
        if (child.type.includes('declarator') || child.type === 'name' ||
            child.type === 'identifier' || child.type === 'formal_parameters' ||
            child.type === 'parameters' || child.type === 'parameter_list') {
          break;
        }
      }
    }
  }

  // Check if this is a class/struct definition
  if (config.classTypes?.includes(parentType) || config.structTypes?.includes(parentType)) {
    return { symbol_type: 'class', is_definition: true, is_write: false };
  }

  // Check for parameter definitions
  if (config.parameterTypes?.includes(parentType) ||
      parentType === 'parameter' || parentType === 'required_parameter' ||
      parentType === 'optional_parameter' || parentType === 'parameter_declaration') {
    return { symbol_type: 'parameter', is_definition: true, is_write: false };
  }

  // Check for variable declarations
  const declarationTypes = ['variable_declaration', 'variable_declarator', 'declaration',
    'lexical_declaration', 'const_declaration', 'let_declaration', 'var_declaration',
    'assignment_expression', 'assignment', 'augmented_assignment'];

  if (declarationTypes.includes(parentType)) {
    // Check if this is the left-hand side (definition/write) or right-hand side (read)
    const firstChild = parent.child(0);
    if (firstChild && (firstChild.id === node.id ||
        (firstChild.type === 'identifier' && firstChild.text === node.text))) {
      return { symbol_type: 'variable', is_definition: true, is_write: true };
    }
    return { symbol_type: 'variable', is_definition: false, is_write: false };
  }

  // Check for field access
  if (parentType === 'member_expression' || parentType === 'field_expression' ||
      parentType === 'attribute' || parentType === 'field_access') {
    return { symbol_type: 'field', is_definition: false, is_write: false };
  }

  // Check for imports
  if (parentType === 'import_statement' || parentType === 'import_specifier' ||
      parentType === 'import_clause' || parentType === 'import_declaration' ||
      parentType === 'import_from_statement') {
    return { symbol_type: 'import', is_definition: true, is_write: false };
  }

  // Check for function calls
  if (parentType === 'call_expression' || parentType === 'call' ||
      parentType === 'method_invocation' || parentType === 'invocation_expression') {
    // The function being called is usually the first child
    const firstChild = parent.child(0);
    if (firstChild && (firstChild.id === node.id ||
        (firstChild.type === node.type && firstChild.text === node.text))) {
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
  const sourceLines = source.split('\n');
  const identifierTypeSet = new Set(config.identifierTypes);

  const tree = create_tree_for_language(source, language);

  let visited_children = false;
  let cursor = tree.walk();

  while (true) {
    if (!visited_children) {
      const node = cursor.currentNode;

      // Check if this is an identifier node type
      if (identifierTypeSet.has(node.type)) {
        const symbol = node.text;

        // Skip empty identifiers or very short ones that are likely noise
        if (symbol && symbol.length > 0) {
          const line = node.startPosition.row + 1;
          const column_start = node.startPosition.column;
          const column_end = node.endPosition.column;
          const context = sourceLines[node.startPosition.row]?.trim() || '';

          // Determine symbol type and definition status from context
          const { symbol_type, is_definition, is_write } = get_symbol_context(node, language);

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
 * @param {Object} classNode - Tree-sitter node for a class/struct definition
 * @param {string} language - The language identifier
 * @returns {Object[]} Array of inheritance relationships with parent_symbol and relationship_type
 */
const extract_inheritance_from_node = (classNode, language) => {
  const relationships = [];
  const config = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.c;

  if (!config.inheritanceTypes || config.inheritanceTypes.length === 0) {
    return relationships;
  }

  // Helper to extract type identifiers from a node
  const extractTypeNames = (node) => {
    const names = [];
    const traverse = (n) => {
      if (!n) return;
      if (n.type === 'type_identifier' || n.type === 'identifier' ||
          n.type === 'name' || n.type === 'constant') {
        // Filter out keywords
        const text = n.text;
        if (text && !['extends', 'implements', 'public', 'private', 'protected', 'virtual'].includes(text)) {
          names.push(text);
        }
      }
      for (let i = 0; i < n.childCount; i++) {
        traverse(n.child(i));
      }
    };
    traverse(node);
    return names;
  };

  // Language-specific extraction
  switch (language) {
    case 'java': {
      // Java: look for superclass and super_interfaces children
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child.type === 'superclass') {
          const types = extractTypeNames(child);
          for (const t of types) {
            relationships.push({ parent_symbol: t, relationship_type: 'extends' });
          }
        } else if (child.type === 'super_interfaces') {
          const types = extractTypeNames(child);
          for (const t of types) {
            relationships.push({ parent_symbol: t, relationship_type: 'implements' });
          }
        }
      }
      break;
    }

    case 'typescript':
    case 'tsx':
    case 'javascript': {
      // TypeScript/JavaScript: look for class_heritage with extends_clause and implements_clause
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child.type === 'class_heritage') {
          for (let j = 0; j < child.childCount; j++) {
            const heritageChild = child.child(j);
            if (heritageChild.type === 'extends_clause') {
              const types = extractTypeNames(heritageChild);
              for (const t of types) {
                relationships.push({ parent_symbol: t, relationship_type: 'extends' });
              }
            } else if (heritageChild.type === 'implements_clause') {
              const types = extractTypeNames(heritageChild);
              for (const t of types) {
                relationships.push({ parent_symbol: t, relationship_type: 'implements' });
              }
            }
          }
        }
        // For interface extends
        if (child.type === 'extends_type_clause' || child.type === 'extends_clause') {
          const types = extractTypeNames(child);
          for (const t of types) {
            relationships.push({ parent_symbol: t, relationship_type: 'extends' });
          }
        }
      }
      break;
    }

    case 'python': {
      // Python: base classes are in argument_list directly after class name
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child.type === 'argument_list') {
          const types = extractTypeNames(child);
          for (const t of types) {
            // Skip common non-class arguments like metaclass=...
            if (!t.includes('=')) {
              relationships.push({ parent_symbol: t, relationship_type: 'extends' });
            }
          }
        }
      }
      break;
    }

    case 'csharp': {
      // C#: base_list contains both base class and interfaces
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child.type === 'base_list') {
          const types = extractTypeNames(child);
          // In C#, first type is usually the base class (if it's a class), rest are interfaces
          // We can't easily distinguish, so mark all as 'extends' for classes
          const isInterface = classNode.type === 'interface_declaration';
          for (const t of types) {
            relationships.push({
              parent_symbol: t,
              relationship_type: isInterface ? 'extends' : 'implements'
            });
          }
        }
      }
      break;
    }

    case 'cpp': {
      // C++: base_class_clause contains base classes
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child.type === 'base_class_clause') {
          const types = extractTypeNames(child);
          for (const t of types) {
            relationships.push({ parent_symbol: t, relationship_type: 'extends' });
          }
        }
      }
      break;
    }

    case 'rust': {
      // Rust: impl_item for trait implementations, trait_bounds for trait constraints
      if (classNode.type === 'impl_item') {
        // Look for "for" keyword which indicates impl Trait for Type
        let traitName = null;
        let forType = null;
        let foundFor = false;

        for (let i = 0; i < classNode.childCount; i++) {
          const child = classNode.child(i);
          if (child.type === 'type_identifier' || child.type === 'generic_type') {
            if (!foundFor) {
              traitName = child.text;
            } else {
              forType = child.text;
            }
          }
          if (child.text === 'for') {
            foundFor = true;
          }
        }

        if (traitName && foundFor) {
          relationships.push({ parent_symbol: traitName, relationship_type: 'implements' });
        }
      }
      break;
    }

    case 'swift': {
      // Swift: inheritance_clause or type_inheritance_clause
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child.type === 'inheritance_clause' || child.type === 'type_inheritance_clause') {
          const types = extractTypeNames(child);
          for (const t of types) {
            relationships.push({ parent_symbol: t, relationship_type: 'extends' });
          }
        }
      }
      break;
    }

    case 'ruby': {
      // Ruby: superclass child
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child.type === 'superclass') {
          const types = extractTypeNames(child);
          for (const t of types) {
            relationships.push({ parent_symbol: t, relationship_type: 'extends' });
          }
        }
      }
      break;
    }

    case 'php': {
      // PHP: base_clause for extends, class_interface_clause for implements
      for (let i = 0; i < classNode.childCount; i++) {
        const child = classNode.child(i);
        if (child.type === 'base_clause') {
          const types = extractTypeNames(child);
          for (const t of types) {
            relationships.push({ parent_symbol: t, relationship_type: 'extends' });
          }
        } else if (child.type === 'class_interface_clause') {
          const types = extractTypeNames(child);
          for (const t of types) {
            relationships.push({ parent_symbol: t, relationship_type: 'implements' });
          }
        }
      }
      break;
    }

    case 'go': {
      // Go: struct embedding via anonymous field declarations
      if (classNode.type === 'struct_type') {
        for (let i = 0; i < classNode.childCount; i++) {
          const child = classNode.child(i);
          if (child.type === 'field_declaration_list') {
            for (let j = 0; j < child.childCount; j++) {
              const field = child.child(j);
              if (field.type === 'field_declaration') {
                // Anonymous field (embedding) has type but no name
                const hasName = field.children.some(c => c.type === 'field_identifier');
                if (!hasName) {
                  const types = extractTypeNames(field);
                  for (const t of types) {
                    relationships.push({ parent_symbol: t, relationship_type: 'embeds' });
                  }
                }
              }
            }
          }
        }
      }
      break;
    }
  }

  return relationships;
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
  const sourceLines = source.split('\n');

  // Get all class types for this language
  const classTypeSet = new Set([
    ...(config.classTypes || []),
    ...(config.structTypes || [])
  ]);

  if (classTypeSet.size === 0) {
    return results;
  }

  const tree = create_tree_for_language(source, language);

  let visited_children = false;
  let cursor = tree.walk();

  while (true) {
    if (!visited_children) {
      const node = cursor.currentNode;

      // Check if this is a class/struct definition
      if (classTypeSet.has(node.type)) {
        // Extract the class name
        let className = null;
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child.type === 'identifier' || child.type === 'type_identifier' ||
              child.type === 'name' || child.type === 'constant') {
            className = child.text;
            break;
          }
        }

        if (className) {
          const relationships = extract_inheritance_from_node(node, language);
          const line = node.startPosition.row + 1;
          const context = sourceLines[node.startPosition.row]?.trim() || '';

          // Determine if this is abstract (language-specific)
          let isAbstract = false;
          if (language === 'java' || language === 'csharp') {
            isAbstract = context.includes('abstract ');
          }
          if (language === 'typescript' || language === 'tsx') {
            isAbstract = context.includes('abstract ');
          }

          results.push({
            class_name: className,
            class_type: node.type,
            filename,
            line,
            context,
            is_abstract: isAbstract,
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
  get_types_from_tree,
  get_source_from_position,
  get_parameters_from_position,
  get_type_from_position,
  get_return_type_from_function,
  get_type_references_from_source,
  get_all_identifiers_from_source,
  extract_inheritance_from_source,
  get_language_from_filename,
  LANGUAGE_CONFIG
};
