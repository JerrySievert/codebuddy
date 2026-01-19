'use strict';

/**
 * @fileoverview Statement handlers for control flow graph construction.
 * Each handler processes a specific type of control flow statement.
 * @module lib/controlflow/handlers
 */

/**
 * Handle if statements (conditionals).
 * @param {Object} stmt - Statement node
 * @param {Object[]} entry_nodes - Entry nodes to connect from
 * @param {Object} context - Handler context with nodes, edges, helpers
 * @returns {Object[]} Exit nodes
 */
export const handle_conditional = (stmt, entry_nodes, context) => {
  const { nodes, edges, cf_types, source, create_node, process_block, process_statement } = context;
  const { extract_condition, get_body, get_else_clause } = context.helpers;

  const condition = extract_condition(stmt, source);
  const decision_node = create_node('decision', condition, {
    line: stmt.startPosition.row + 1,
    end_line: stmt.endPosition.row + 1,
    source_snippet: stmt.text
  });
  nodes.push(decision_node);

  // Connect entry nodes to decision
  for (const entry of entry_nodes) {
    edges.push({ from: entry.id, to: decision_node.id, label: '' });
  }

  const exit_nodes = [];

  // Process then branch
  const then_body = get_body(stmt);
  if (then_body) {
    const then_exits = process_block(then_body, [decision_node], 'Yes');
    exit_nodes.push(...then_exits);
  } else {
    exit_nodes.push(decision_node);
  }

  // Process else branch
  const else_clause = get_else_clause(stmt);
  if (else_clause) {
    // Check if it's elif/else if
    let else_body = null;
    for (let i = 0; i < else_clause.childCount; i++) {
      const child = else_clause.child(i);
      if (child.type === 'if_statement') {
        // Else-if chain - process recursively
        const else_if_exits = process_statement(child, [decision_node]);
        // Label the edge as 'No'
        const last_edge = edges[edges.length - 1];
        if (last_edge && last_edge.from === decision_node.id) {
          last_edge.label = 'No';
        }
        exit_nodes.push(...else_if_exits);
        return exit_nodes;
      }
      if (context.helpers.is_block(child)) {
        else_body = child;
        break;
      }
    }
    if (else_body) {
      const else_exits = process_block(else_body, [decision_node], 'No');
      exit_nodes.push(...else_exits);
    }
  } else {
    // No else - decision connects directly to next
    const no_op_node = create_node('connector', '', { invisible: true });
    nodes.push(no_op_node);
    edges.push({ from: decision_node.id, to: no_op_node.id, label: 'No' });
    exit_nodes.push(no_op_node);
  }

  return exit_nodes;
};

/**
 * Handle loop statements (for, while, do-while).
 * @param {Object} stmt - Statement node
 * @param {Object[]} entry_nodes - Entry nodes to connect from
 * @param {Object} context - Handler context
 * @returns {Object[]} Exit nodes
 */
export const handle_loop = (stmt, entry_nodes, context) => {
  const { nodes, edges, source, create_node, process_block } = context;
  const { extract_loop_header, get_body } = context.helpers;

  const loop_header = extract_loop_header(stmt, source);
  const loop_node = create_node('loop', loop_header, {
    line: stmt.startPosition.row + 1,
    end_line: stmt.endPosition.row + 1,
    source_snippet: stmt.text
  });
  nodes.push(loop_node);

  // Connect entry nodes to loop
  for (const entry of entry_nodes) {
    edges.push({ from: entry.id, to: loop_node.id, label: '' });
  }

  // Process loop body
  const body = get_body(stmt);
  if (body) {
    const body_exits = process_block(body, [loop_node], 'Loop');
    // Connect body exits back to loop node
    for (const exit of body_exits) {
      if (exit.type !== 'return' && exit.type !== 'break') {
        edges.push({ from: exit.id, to: loop_node.id, label: '' });
      }
    }
  }

  // Loop exit node
  const exit_node = create_node('connector', '', { invisible: true });
  nodes.push(exit_node);
  edges.push({ from: loop_node.id, to: exit_node.id, label: 'Done' });

  return [exit_node];
};

/**
 * Handle switch statements.
 * @param {Object} stmt - Statement node
 * @param {Object[]} entry_nodes - Entry nodes to connect from
 * @param {Object} context - Handler context
 * @returns {Object[]} Exit nodes
 */
export const handle_switch = (stmt, entry_nodes, context) => {
  const { nodes, edges, cf_types, create_node, process_block } = context;
  const { is_block } = context.helpers;

  let switch_expr = 'switch';
  for (let i = 0; i < stmt.childCount; i++) {
    const child = stmt.child(i);
    if (child.type === 'parenthesized_expression') {
      switch_expr = `switch ${child.text}`;
      break;
    }
  }

  const switch_node = create_node('decision', switch_expr, {
    line: stmt.startPosition.row + 1,
    end_line: stmt.endPosition.row + 1,
    source_snippet: stmt.text,
    shape: 'switch'
  });
  nodes.push(switch_node);

  for (const entry of entry_nodes) {
    edges.push({ from: entry.id, to: switch_node.id, label: '' });
  }

  const exit_nodes = [];

  // Process cases
  for (let i = 0; i < stmt.childCount; i++) {
    const child = stmt.child(i);
    if (cf_types.cases && cf_types.cases.includes(child.type)) {
      let case_label = 'case';
      // Extract case value
      for (let j = 0; j < child.childCount; j++) {
        const case_child = child.child(j);
        if (case_child.type !== 'case' && case_child.type !== ':' &&
            !is_block(case_child) && !case_child.type.includes('statement')) {
          case_label = `case ${case_child.text}`;
          break;
        }
      }
      if (child.type === 'switch_default' || child.type === 'default_statement') {
        case_label = 'default';
      }

      const case_exits = process_block(child, [switch_node], case_label);
      exit_nodes.push(...case_exits);
    }
  }

  if (exit_nodes.length === 0) {
    exit_nodes.push(switch_node);
  }

  return exit_nodes;
};

/**
 * Handle jump statements (return, break, continue, throw).
 * @param {Object} stmt - Statement node
 * @param {Object[]} entry_nodes - Entry nodes to connect from
 * @param {Object} context - Handler context
 * @returns {Object[]} Exit nodes
 */
export const handle_jump = (stmt, entry_nodes, context) => {
  const { nodes, edges, create_node } = context;
  const stmt_type = stmt.type;

  let label = stmt_type.replace('_statement', '').replace('_expression', '');
  if (stmt_type === 'return_statement' || stmt_type === 'return_expression') {
    // Get return value if any
    const return_text = stmt.text.trim();
    label = return_text.length > 30 ? return_text.substring(0, 27) + '...' : return_text;
  }

  const jump_node = create_node(
    (stmt_type === 'return_statement' || stmt_type === 'return_expression') ? 'return' : 'process',
    label,
    {
      line: stmt.startPosition.row + 1,
      end_line: stmt.endPosition.row + 1,
      source_snippet: stmt.text
    }
  );
  nodes.push(jump_node);

  for (const entry of entry_nodes) {
    edges.push({ from: entry.id, to: jump_node.id, label: '' });
  }

  // Return and throw statements terminate flow
  if (stmt_type === 'return_statement' || stmt_type === 'return_expression' ||
      stmt_type === 'throw_statement' || stmt_type === 'raise_statement') {
    return []; // No exit nodes - flow terminates
  }

  return [jump_node];
};

/**
 * Handle try-catch-finally statements.
 * @param {Object} stmt - Statement node
 * @param {Object[]} entry_nodes - Entry nodes to connect from
 * @param {Object} context - Handler context
 * @returns {Object[]} Exit nodes
 */
export const handle_try_catch = (stmt, entry_nodes, context) => {
  const { nodes, edges, create_node, process_block } = context;
  const { is_block, get_body } = context.helpers;

  const try_node = create_node('process', 'try', {
    line: stmt.startPosition.row + 1,
    end_line: stmt.endPosition.row + 1,
    source_snippet: stmt.text
  });
  nodes.push(try_node);

  for (const entry of entry_nodes) {
    edges.push({ from: entry.id, to: try_node.id, label: '' });
  }

  const exit_nodes = [];

  // Process try block and catch clauses
  for (let i = 0; i < stmt.childCount; i++) {
    const child = stmt.child(i);
    if (is_block(child)) {
      const try_exits = process_block(child, [try_node], '');
      exit_nodes.push(...try_exits);
    } else if (child.type === 'catch_clause' || child.type === 'except_clause') {
      let catch_label = 'catch';
      for (let j = 0; j < child.childCount; j++) {
        const catch_child = child.child(j);
        if (catch_child.type === 'catch_formal_parameter' ||
            catch_child.type === 'catch_declaration') {
          catch_label = `catch (${catch_child.text})`;
          break;
        }
      }
      const catch_node = create_node('process', catch_label, {
        line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        source_snippet: child.text
      });
      nodes.push(catch_node);
      edges.push({ from: try_node.id, to: catch_node.id, label: 'exception' });

      const catch_body = get_body(child);
      if (catch_body) {
        const catch_exits = process_block(catch_body, [catch_node], '');
        exit_nodes.push(...catch_exits);
      } else {
        exit_nodes.push(catch_node);
      }
    } else if (child.type === 'finally_clause') {
      const finally_node = create_node('process', 'finally', {
        line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        source_snippet: child.text
      });
      nodes.push(finally_node);
      // Finally connects from all previous exits
      for (const exit of [...exit_nodes]) {
        edges.push({ from: exit.id, to: finally_node.id, label: '' });
      }
      exit_nodes.length = 0;

      const finally_body = get_body(child);
      if (finally_body) {
        const finally_exits = process_block(finally_body, [finally_node], '');
        exit_nodes.push(...finally_exits);
      } else {
        exit_nodes.push(finally_node);
      }
    }
  }

  return exit_nodes;
};

/**
 * Handle generic statements (assignments, expressions, etc.).
 * @param {Object} stmt - Statement node
 * @param {Object[]} entry_nodes - Entry nodes to connect from
 * @param {Object} context - Handler context
 * @returns {Object[]} Exit nodes
 */
export const handle_generic = (stmt, entry_nodes, context) => {
  const { nodes, edges, create_node } = context;

  const stmt_text = stmt.text.split('\n')[0].trim();
  if (stmt_text && stmt_text !== '{' && stmt_text !== '}' && stmt_text.length > 1) {
    const process_node = create_node('process', stmt_text, {
      line: stmt.startPosition.row + 1,
      end_line: stmt.endPosition.row + 1,
      source_snippet: stmt.text
    });
    nodes.push(process_node);

    for (const entry of entry_nodes) {
      edges.push({ from: entry.id, to: process_node.id, label: '' });
    }

    return [process_node];
  }

  return entry_nodes;
};
