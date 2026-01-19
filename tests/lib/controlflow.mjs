'use strict';

/**
 * @fileoverview Tests for control flow graph generation.
 * Tests the build_control_flow_graph and related functions.
 */

import { test } from 'st';
import {
  build_control_flow_graph,
  build_control_flow_from_source,
  create_node,
  reset_node_id_counter
} from '../../lib/controlflow.mjs';
import { create_tree } from '../../lib/functions.mjs';

// ============ reset_node_id_counter tests ============

await test('reset_node_id_counter resets counter', async (t) => {
  // Create some nodes to increment counter
  reset_node_id_counter();
  const node1 = create_node('process', 'test1');
  const node2 = create_node('process', 'test2');

  // Reset and create another node - should start from 1 again
  reset_node_id_counter();
  const node3 = create_node('process', 'test3');

  t.assert.eq(node1.id, 'node_1', 'First node should be node_1');
  t.assert.eq(node2.id, 'node_2', 'Second node should be node_2');
  t.assert.eq(node3.id, 'node_1', 'After reset, should be node_1 again');
});

// ============ create_node tests ============

await test('create_node creates node with correct structure', async (t) => {
  reset_node_id_counter();
  const node = create_node('decision', 'if (x > 0)', { line: 5 });

  t.assert.eq(node.id, 'node_1', 'Should have correct id');
  t.assert.eq(node.type, 'decision', 'Should have correct type');
  t.assert.eq(node.label, 'if (x > 0)', 'Should have correct label');
  t.assert.eq(node.line, 5, 'Should have line from options');
});

await test('create_node handles different node types', async (t) => {
  reset_node_id_counter();

  const start = create_node('start', 'Start');
  const process = create_node('process', 'x = 1');
  const decision = create_node('decision', 'x > 0');
  const loop = create_node('loop', 'while');
  const end = create_node('end', 'End');

  t.assert.eq(start.type, 'start', 'Should create start node');
  t.assert.eq(process.type, 'process', 'Should create process node');
  t.assert.eq(decision.type, 'decision', 'Should create decision node');
  t.assert.eq(loop.type, 'loop', 'Should create loop node');
  t.assert.eq(end.type, 'end', 'Should create end node');
});

await test('create_node truncates long labels', async (t) => {
  reset_node_id_counter();
  const long_label = 'a'.repeat(60);
  const node = create_node('process', long_label);

  t.assert.ok(node.label.length <= 50, 'Label should be truncated to 50 chars');
  t.assert.ok(
    node.label.endsWith('...'),
    'Truncated label should end with ...'
  );
  t.assert.eq(
    node.full_label,
    long_label,
    'full_label should have original text'
  );
});

// ============ build_control_flow_graph tests ============

await test('build_control_flow_graph creates graph for simple C function', async (t) => {
  const source = `
int add(int a, int b) {
  return a + b;
}
`;
  const tree = create_tree(source, 'c');
  // Find the function node
  let function_node = null;
  const cursor = tree.walk();
  const find_function = () => {
    if (cursor.currentNode.type === 'function_definition') {
      function_node = cursor.currentNode;
      return;
    }
    if (cursor.gotoFirstChild()) {
      do {
        find_function();
        if (function_node) return;
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };
  find_function();

  t.assert.ok(function_node, 'Should find function node');

  const cfg = build_control_flow_graph(function_node, source, 'c');

  t.assert.ok(cfg.nodes, 'Should have nodes array');
  t.assert.ok(cfg.edges, 'Should have edges array');
  t.assert.ok(
    cfg.nodes.length >= 2,
    'Should have at least start and end nodes'
  );

  // Check for start and end nodes
  const start_node = cfg.nodes.find((n) => n.type === 'start');
  const end_node = cfg.nodes.find((n) => n.type === 'end');
  t.assert.ok(start_node, 'Should have a start node');
  t.assert.ok(end_node, 'Should have an end node');
});

await test('build_control_flow_graph handles if statement', async (t) => {
  const source = `
int check(int x) {
  if (x > 0) {
    return 1;
  }
  return 0;
}
`;
  const tree = create_tree(source, 'c');
  let function_node = null;
  const cursor = tree.walk();
  const find_function = () => {
    if (cursor.currentNode.type === 'function_definition') {
      function_node = cursor.currentNode;
      return;
    }
    if (cursor.gotoFirstChild()) {
      do {
        find_function();
        if (function_node) return;
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };
  find_function();

  const cfg = build_control_flow_graph(function_node, source, 'c');

  // Should have a decision node for the if statement
  const decision_node = cfg.nodes.find((n) => n.type === 'decision');
  t.assert.ok(decision_node, 'Should have a decision node for if statement');
});

// ============ build_control_flow_from_source tests ============

await test('build_control_flow_from_source finds function by line number', async (t) => {
  const source = `int foo() { return 1; }
int bar() { return 2; }
`;

  // bar starts at line 2
  const cfg = build_control_flow_from_source(source, 'c', 2, 2);

  t.assert.ok(cfg, 'Should return a CFG');
  t.assert.ok(cfg.nodes, 'Should have nodes');
});

await test('build_control_flow_from_source returns error for non-existent function', async (t) => {
  const source = `int foo() { return 1; }`;

  // No function at line 100
  const cfg = build_control_flow_from_source(source, 'c', 100, 100);

  // The function returns { nodes: [], edges: [], error: 'Function not found' }
  t.assert.ok(cfg.error, 'Should have error property');
  t.assert.eq(cfg.nodes.length, 0, 'Should have empty nodes array');
});

await test('build_control_flow_from_source handles JavaScript', async (t) => {
  const source = `function greet(name) {
  if (name) {
    return 'Hello, ' + name;
  }
  return 'Hello';
}
`;

  // Function starts at line 1
  const cfg = build_control_flow_from_source(source, 'javascript', 1, 6);

  t.assert.ok(cfg, 'Should return a CFG for JavaScript');
  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');

  const decision = cfg.nodes.find((n) => n.type === 'decision');
  t.assert.ok(decision, 'Should have decision node for if statement');
});

await test('build_control_flow_from_source handles Python', async (t) => {
  const source = `def process(x):
    if x > 0:
        return x * 2
    return 0
`;

  // Function starts at line 1
  const cfg = build_control_flow_from_source(source, 'python', 1, 4);

  t.assert.ok(cfg, 'Should return a CFG for Python');
  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');
});

// ============ Control flow handlers tests (via build_control_flow_graph) ============

await test('build_control_flow_graph handles for loop', async (t) => {
  const source = `
int sum(int n) {
  int total = 0;
  for (int i = 0; i < n; i++) {
    total += i;
  }
  return total;
}
`;
  const tree = create_tree(source, 'c');
  let function_node = null;
  const cursor = tree.walk();
  const find_function = () => {
    if (cursor.currentNode.type === 'function_definition') {
      function_node = cursor.currentNode;
      return;
    }
    if (cursor.gotoFirstChild()) {
      do {
        find_function();
        if (function_node) return;
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };
  find_function();

  const cfg = build_control_flow_graph(function_node, source, 'c');

  const loop_node = cfg.nodes.find((n) => n.type === 'loop');
  t.assert.ok(loop_node, 'Should have a loop node for for statement');
});

await test('build_control_flow_graph handles while loop', async (t) => {
  const source = `
int countdown(int n) {
  while (n > 0) {
    n--;
  }
  return n;
}
`;
  const tree = create_tree(source, 'c');
  let function_node = null;
  const cursor = tree.walk();
  const find_function = () => {
    if (cursor.currentNode.type === 'function_definition') {
      function_node = cursor.currentNode;
      return;
    }
    if (cursor.gotoFirstChild()) {
      do {
        find_function();
        if (function_node) return;
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };
  find_function();

  const cfg = build_control_flow_graph(function_node, source, 'c');

  const loop_node = cfg.nodes.find((n) => n.type === 'loop');
  t.assert.ok(loop_node, 'Should have a loop node for while statement');
});

await test('build_control_flow_graph handles switch statement', async (t) => {
  const source = `
int classify(int x) {
  switch (x) {
    case 1: return 10;
    case 2: return 20;
    default: return 0;
  }
}
`;
  const tree = create_tree(source, 'c');
  let function_node = null;
  const cursor = tree.walk();
  const find_function = () => {
    if (cursor.currentNode.type === 'function_definition') {
      function_node = cursor.currentNode;
      return;
    }
    if (cursor.gotoFirstChild()) {
      do {
        find_function();
        if (function_node) return;
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };
  find_function();

  const cfg = build_control_flow_graph(function_node, source, 'c');

  // Switch should create some structure
  t.assert.ok(cfg.nodes.length >= 3, 'Should have multiple nodes for switch');
});

await test('build_control_flow_graph handles try-catch in JavaScript', async (t) => {
  const source = `function safeDivide(a, b) {
  try {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  } catch (e) {
    return 0;
  }
}
`;
  const cfg = build_control_flow_from_source(source, 'javascript', 1, 8);

  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');
  // Try-catch should create additional structure
  t.assert.ok(cfg.edges.length > 0, 'Should have edges');
});

await test('build_control_flow_graph handles else-if chain', async (t) => {
  const source = `
int grade(int score) {
  if (score >= 90) {
    return 4;
  } else if (score >= 80) {
    return 3;
  } else if (score >= 70) {
    return 2;
  } else {
    return 1;
  }
}
`;
  const tree = create_tree(source, 'c');
  let function_node = null;
  const cursor = tree.walk();
  const find_function = () => {
    if (cursor.currentNode.type === 'function_definition') {
      function_node = cursor.currentNode;
      return;
    }
    if (cursor.gotoFirstChild()) {
      do {
        find_function();
        if (function_node) return;
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };
  find_function();

  const cfg = build_control_flow_graph(function_node, source, 'c');

  const decision_nodes = cfg.nodes.filter((n) => n.type === 'decision');
  t.assert.ok(
    decision_nodes.length >= 3,
    'Should have multiple decision nodes for else-if chain'
  );
});

await test('build_control_flow_graph handles nested loops', async (t) => {
  const source = `
void nested(int n) {
  for (int i = 0; i < n; i++) {
    for (int j = 0; j < n; j++) {
      printf("%d", i * j);
    }
  }
}
`;
  const tree = create_tree(source, 'c');
  let function_node = null;
  const cursor = tree.walk();
  const find_function = () => {
    if (cursor.currentNode.type === 'function_definition') {
      function_node = cursor.currentNode;
      return;
    }
    if (cursor.gotoFirstChild()) {
      do {
        find_function();
        if (function_node) return;
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };
  find_function();

  const cfg = build_control_flow_graph(function_node, source, 'c');

  const loop_nodes = cfg.nodes.filter((n) => n.type === 'loop');
  t.assert.ok(
    loop_nodes.length >= 2,
    'Should have multiple loop nodes for nested loops'
  );
});

await test('build_control_flow_graph handles return statement', async (t) => {
  const source = `
int earlyReturn(int x) {
  if (x < 0) {
    return -1;
  }
  return x * 2;
}
`;
  const tree = create_tree(source, 'c');
  let function_node = null;
  const cursor = tree.walk();
  const find_function = () => {
    if (cursor.currentNode.type === 'function_definition') {
      function_node = cursor.currentNode;
      return;
    }
    if (cursor.gotoFirstChild()) {
      do {
        find_function();
        if (function_node) return;
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  };
  find_function();

  const cfg = build_control_flow_graph(function_node, source, 'c');

  const return_nodes = cfg.nodes.filter((n) => n.type === 'return');
  t.assert.ok(return_nodes.length >= 1, 'Should have return nodes');
});

await test('build_control_flow_from_source handles TypeScript', async (t) => {
  const source = `function process(x: number): number {
  if (x > 0) {
    return x * 2;
  }
  return 0;
}
`;
  const cfg = build_control_flow_from_source(source, 'typescript', 1, 6);

  t.assert.ok(cfg, 'Should return a CFG for TypeScript');
  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');
});

await test('build_control_flow_from_source handles Java', async (t) => {
  const source = `public int calculate(int x) {
  if (x > 0) {
    return x * 2;
  }
  return 0;
}
`;
  const cfg = build_control_flow_from_source(source, 'java', 1, 6);

  t.assert.ok(cfg, 'Should return a CFG for Java');
  t.assert.ok(cfg.nodes.length > 0, 'Should have nodes');
});
