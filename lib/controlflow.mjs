'use strict';

/**
 * @fileoverview Control flow graph extraction from AST.
 * Builds flowchart-compatible control flow graphs from function ASTs.
 * @module lib/controlflow
 */

import Parser from 'tree-sitter';
import C from 'tree-sitter-c';
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

import {
  handle_conditional,
  handle_loop,
  handle_switch,
  handle_jump,
  handle_try_catch,
  handle_generic
} from './controlflow/handlers.mjs';

// ============================================================================
// Language configurations
// ============================================================================

const LANGUAGE_CONFIG = {
  c: { parser: C },
  javascript: { parser: JavaScript },
  python: { parser: Python },
  java: { parser: Java },
  csharp: { parser: CSharp },
  typescript: { parser: TypeScript.typescript },
  tsx: { parser: TypeScript.tsx },
  rust: { parser: Rust },
  swift: { parser: Swift },
  ruby: { parser: Ruby },
  php: { parser: PHP.php },
  zig: { parser: Zig },
  go: { parser: Go }
};

// ============================================================================
// Control flow node types by language
// ============================================================================

const CONTROL_FLOW_TYPES = {
  c: {
    conditionals: ['if_statement'],
    loops: ['for_statement', 'while_statement', 'do_statement'],
    switches: ['switch_statement'],
    jumps: [
      'return_statement',
      'break_statement',
      'continue_statement',
      'goto_statement'
    ],
    cases: ['case_statement', 'default_statement']
  },
  javascript: {
    conditionals: ['if_statement'],
    loops: [
      'for_statement',
      'while_statement',
      'do_statement',
      'for_in_statement',
      'for_of_statement'
    ],
    switches: ['switch_statement'],
    jumps: [
      'return_statement',
      'break_statement',
      'continue_statement',
      'throw_statement'
    ],
    cases: ['switch_case', 'switch_default'],
    try_catch: ['try_statement']
  },
  python: {
    conditionals: ['if_statement'],
    loops: ['for_statement', 'while_statement'],
    switches: ['match_statement'],
    jumps: [
      'return_statement',
      'break_statement',
      'continue_statement',
      'raise_statement'
    ],
    cases: ['case_clause'],
    try_catch: ['try_statement']
  },
  java: {
    conditionals: ['if_statement'],
    loops: [
      'for_statement',
      'while_statement',
      'do_statement',
      'enhanced_for_statement'
    ],
    switches: ['switch_expression', 'switch_statement'],
    jumps: [
      'return_statement',
      'break_statement',
      'continue_statement',
      'throw_statement'
    ],
    cases: ['switch_block_statement_group', 'switch_rule'],
    try_catch: ['try_statement']
  },
  csharp: {
    conditionals: ['if_statement'],
    loops: [
      'for_statement',
      'while_statement',
      'do_statement',
      'foreach_statement'
    ],
    switches: ['switch_statement', 'switch_expression'],
    jumps: [
      'return_statement',
      'break_statement',
      'continue_statement',
      'throw_statement'
    ],
    cases: ['switch_section'],
    try_catch: ['try_statement']
  },
  typescript: {
    conditionals: ['if_statement'],
    loops: [
      'for_statement',
      'while_statement',
      'do_statement',
      'for_in_statement',
      'for_of_statement'
    ],
    switches: ['switch_statement'],
    jumps: [
      'return_statement',
      'break_statement',
      'continue_statement',
      'throw_statement'
    ],
    cases: ['switch_case', 'switch_default'],
    try_catch: ['try_statement']
  },
  rust: {
    conditionals: ['if_expression', 'if_let_expression'],
    loops: [
      'for_expression',
      'while_expression',
      'while_let_expression',
      'loop_expression'
    ],
    switches: ['match_expression'],
    jumps: ['return_expression', 'break_expression', 'continue_expression'],
    cases: ['match_arm'],
    try_catch: []
  },
  swift: {
    conditionals: ['if_statement', 'guard_statement'],
    loops: [
      'for_statement',
      'while_statement',
      'repeat_while_statement',
      'for_in_statement'
    ],
    switches: ['switch_statement'],
    jumps: [
      'return_statement',
      'break_statement',
      'continue_statement',
      'throw_statement'
    ],
    cases: ['case_item'],
    try_catch: ['do_statement']
  },
  ruby: {
    conditionals: ['if', 'unless', 'if_modifier', 'unless_modifier'],
    loops: ['for', 'while', 'until', 'while_modifier', 'until_modifier'],
    switches: ['case'],
    jumps: ['return', 'break', 'next', 'raise'],
    cases: ['when'],
    try_catch: ['begin']
  },
  php: {
    conditionals: ['if_statement'],
    loops: [
      'for_statement',
      'while_statement',
      'do_statement',
      'foreach_statement'
    ],
    switches: ['switch_statement'],
    jumps: [
      'return_statement',
      'break_statement',
      'continue_statement',
      'throw_statement'
    ],
    cases: ['case_statement', 'default_statement'],
    try_catch: ['try_statement']
  },
  zig: {
    conditionals: ['if_statement'],
    loops: ['for_statement', 'while_statement'],
    switches: ['switch_expression'],
    jumps: ['return_statement', 'break_statement', 'continue_statement'],
    cases: ['switch_prong'],
    try_catch: []
  },
  go: {
    conditionals: ['if_statement'],
    loops: ['for_statement'],
    switches: ['expression_switch_statement', 'type_switch_statement'],
    jumps: [
      'return_statement',
      'break_statement',
      'continue_statement',
      'goto_statement'
    ],
    cases: ['expression_case', 'default_case', 'type_case'],
    try_catch: []
  }
};

// Make tsx use same config as typescript
CONTROL_FLOW_TYPES.tsx = CONTROL_FLOW_TYPES.typescript;

// ============================================================================
// Node utilities
// ============================================================================

let node_id_counter = 0;

/**
 * Generate a unique node ID.
 * @returns {string} Unique node ID
 */
const generate_node_id = () => `node_${++node_id_counter}`;

/**
 * Reset node ID counter (for testing).
 */
const reset_node_id_counter = () => {
  node_id_counter = 0;
};

/**
 * Create a flowchart node.
 * @param {string} type - Node type (start, end, process, decision, loop, return)
 * @param {string} label - Display label
 * @param {Object} options - Additional options
 * @returns {Object} Flowchart node
 */
const create_node = (type, label, options = {}) => ({
  id: generate_node_id(),
  type,
  label: label.length > 50 ? label.substring(0, 47) + '...' : label,
  full_label: label,
  line: options.line || null,
  end_line: options.end_line || options.line || null,
  source_snippet: options.source_snippet || null,
  ...options
});

// ============================================================================
// AST helper functions
// ============================================================================

/**
 * Extract condition text from a conditional node.
 * @param {Object} node - Tree-sitter node
 * @param {string} source - Source code
 * @returns {string} Condition text
 */
const extract_condition = (node, source) => {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (
      child.type === 'parenthesized_expression' ||
      child.type === 'condition_clause' ||
      child.type === 'condition'
    ) {
      return child.text;
    }
  }
  // For Python, look for the expression between 'if' and ':'
  if (node.type === 'if_statement') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (
        child.type !== 'if' &&
        child.type !== ':' &&
        child.type !== 'block' &&
        child.type !== 'elif_clause' &&
        child.type !== 'else_clause'
      ) {
        return child.text;
      }
    }
  }
  return 'condition';
};

/**
 * Extract loop condition from a loop node.
 * @param {Object} node - Tree-sitter node
 * @param {string} source - Source code
 * @returns {string} Loop header text
 */
const extract_loop_header = (node, source) => {
  if (
    node.type === 'for_statement' ||
    node.type === 'for_in_statement' ||
    node.type === 'for_of_statement' ||
    node.type === 'enhanced_for_statement' ||
    node.type === 'foreach_statement'
  ) {
    const parts = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (
        child.type === 'compound_statement' ||
        child.type === 'statement_block' ||
        child.type === 'block' ||
        child.type === '{'
      ) {
        break;
      }
      parts.push(child.text);
    }
    return parts.join(' ').trim() || 'for loop';
  }
  if (node.type === 'while_statement') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (
        child.type === 'parenthesized_expression' ||
        child.type === 'condition'
      ) {
        return `while ${child.text}`;
      }
    }
    return 'while loop';
  }
  if (node.type === 'do_statement') {
    return 'do';
  }
  return 'loop';
};

/**
 * Check if a node is a compound statement / block.
 * @param {Object} node - Tree-sitter node
 * @returns {boolean}
 */
const is_block = (node) => {
  return (
    node.type === 'compound_statement' ||
    node.type === 'statement_block' ||
    node.type === 'block'
  );
};

/**
 * Get the body of a control flow statement.
 * @param {Object} node - Tree-sitter node
 * @returns {Object|null} Body node
 */
const get_body = (node) => {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (is_block(child)) {
      return child;
    }
  }
  // For single-statement bodies
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (
      child.type.includes('statement') &&
      !child.type.includes('if') &&
      child.type !== 'parenthesized_expression'
    ) {
      return child;
    }
  }
  return null;
};

/**
 * Get the else clause of an if statement.
 * @param {Object} node - Tree-sitter node
 * @returns {Object|null} Else clause node
 */
const get_else_clause = (node) => {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'else_clause' || child.type === 'elif_clause') {
      return child;
    }
  }
  return null;
};

// Bundle helpers for handlers
const ast_helpers = {
  extract_condition,
  extract_loop_header,
  is_block,
  get_body,
  get_else_clause
};

// ============================================================================
// Control flow graph builder
// ============================================================================

/**
 * Build control flow graph from an AST node.
 * @param {Object} node - Tree-sitter AST node
 * @param {string} source - Source code
 * @param {string} language - Language identifier
 * @returns {Object} Control flow graph { nodes: [], edges: [] }
 */
const build_control_flow_graph = (node, source, language = 'c') => {
  reset_node_id_counter();

  const nodes = [];
  const edges = [];
  const cf_types = CONTROL_FLOW_TYPES[language] || CONTROL_FLOW_TYPES.c;

  // Create start node
  const start_node = create_node('start', 'Start');
  nodes.push(start_node);

  /**
   * Process a block of statements.
   * @param {Object} block - Block node
   * @param {Object[]} entry_nodes - Entry nodes
   * @param {string} edge_label - Label for edge from entry
   * @returns {Object[]} Exit nodes
   */
  const process_block = (block, entry_nodes, edge_label) => {
    let current = entry_nodes;

    // If edge_label provided, update the edges
    if (edge_label && edges.length > 0) {
      const last_edge_idx = edges.length - 1;
      if (edges[last_edge_idx].from === entry_nodes[0]?.id) {
        edges[last_edge_idx].label = edge_label;
      }
    }

    for (let i = 0; i < block.childCount; i++) {
      const child = block.child(i);
      // Skip braces and other non-statement nodes
      if (
        child.type === '{' ||
        child.type === '}' ||
        child.type === 'comment'
      ) {
        continue;
      }
      current = process_statement(child, current);
      if (current.length === 0) {
        // Flow was terminated (return/throw)
        return [];
      }
    }

    return current;
  };

  /**
   * Process a statement and return exit nodes.
   * @param {Object} stmt - Statement node
   * @param {Object[]} entry_nodes - Entry nodes to connect from
   * @returns {Object[]} Exit nodes
   */
  const process_statement = (stmt, entry_nodes) => {
    if (!stmt) return entry_nodes;

    const stmt_type = stmt.type;

    // Build handler context
    const context = {
      nodes,
      edges,
      cf_types,
      source,
      create_node,
      process_block,
      process_statement,
      helpers: ast_helpers
    };

    // Dispatch to appropriate handler based on statement type
    if (cf_types.conditionals.includes(stmt_type)) {
      return handle_conditional(stmt, entry_nodes, context);
    }

    if (cf_types.loops.includes(stmt_type)) {
      return handle_loop(stmt, entry_nodes, context);
    }

    if (cf_types.switches && cf_types.switches.includes(stmt_type)) {
      return handle_switch(stmt, entry_nodes, context);
    }

    if (cf_types.jumps.includes(stmt_type)) {
      return handle_jump(stmt, entry_nodes, context);
    }

    if (cf_types.try_catch && cf_types.try_catch.includes(stmt_type)) {
      return handle_try_catch(stmt, entry_nodes, context);
    }

    // Handle blocks
    if (is_block(stmt)) {
      return process_block(stmt, entry_nodes, '');
    }

    // Generic statement
    return handle_generic(stmt, entry_nodes, context);
  };

  // Find the function body
  let body = null;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (is_block(child)) {
      body = child;
      break;
    }
  }

  // Process the function body
  let current_nodes = [start_node];
  if (body) {
    current_nodes = process_block(body, current_nodes, '');
  }

  // Create end node and connect remaining exits
  const end_node = create_node('end', 'End');
  nodes.push(end_node);

  for (const exit of current_nodes) {
    edges.push({ from: exit.id, to: end_node.id, label: '' });
  }

  // Connect any return nodes to end
  for (const n of nodes) {
    if (n.type === 'return') {
      edges.push({ from: n.id, to: end_node.id, label: '' });
    }
  }

  // Filter out invisible connector nodes for cleaner output
  const visible_nodes = nodes.filter((n) => !n.invisible);
  const node_ids = new Set(visible_nodes.map((n) => n.id));

  // Remap edges that point to/from invisible nodes
  const clean_edges = [];
  for (const edge of edges) {
    if (node_ids.has(edge.from) && node_ids.has(edge.to)) {
      clean_edges.push(edge);
    }
  }

  return { nodes: visible_nodes, edges: clean_edges };
};

// ============================================================================
// Source code entry point
// ============================================================================

/**
 * Build control flow graph from source code.
 * @param {string} source - Full source code
 * @param {string} language - Language identifier
 * @param {number} start_line - Function start line
 * @param {number} end_line - Function end line
 * @returns {Object} Control flow graph
 */
const build_control_flow_from_source = (
  source,
  language,
  start_line,
  end_line
) => {
  const config = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.c;
  const parser = new Parser();
  parser.setLanguage(config.parser);

  const tree = parser.parse(source);

  // Find the function node at the given line
  let function_node = null;

  const func_types = [
    'function_definition',
    'function_declaration',
    'function_expression',
    'arrow_function',
    'method_definition',
    'method_declaration',
    'constructor_declaration'
  ];

  /**
   * Find function at exact start line.
   * @param {Object} node - AST node to search
   */
  const find_function = (node) => {
    if (node.startPosition.row + 1 === start_line) {
      if (func_types.includes(node.type)) {
        function_node = node;
        return;
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      find_function(node.child(i));
      if (function_node) return;
    }
  };

  find_function(tree.rootNode);

  if (!function_node) {
    /**
     * Find any function containing the line range.
     * @param {Object} node - AST node to search
     */
    const find_containing_function = (node) => {
      if (func_types.includes(node.type)) {
        if (
          node.startPosition.row + 1 <= start_line &&
          node.endPosition.row + 1 >= end_line
        ) {
          function_node = node;
          return;
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        find_containing_function(node.child(i));
        if (function_node) return;
      }
    };

    find_containing_function(tree.rootNode);
  }

  if (!function_node) {
    return { nodes: [], edges: [], error: 'Function not found' };
  }

  return build_control_flow_graph(function_node, source, language);
};

export {
  build_control_flow_graph,
  build_control_flow_from_source,
  create_node,
  reset_node_id_counter
};
