'use strict';

import { get_types_from_tree, prepare_entities_for_nodes } from '../../lib/project.mjs';
import { test } from 'st';

// ============ get_types_from_tree tests ============

await test('get_types_from_tree extracts unique node types', async (t) => {
  // Create a simple mock tree with walk() method
  const nodes = [
    { type: 'program', children: [
      { type: 'function_definition', children: [
        { type: 'identifier', children: [] },
        { type: 'parameter_list', children: [] }
      ]},
      { type: 'comment', children: [] }
    ]}
  ];

  // Flatten nodes for cursor traversal
  const flatNodes = [];
  const flatten = (node, parent = null) => {
    flatNodes.push({ ...node, parent, originalChildren: node.children });
    if (node.children) {
      for (const child of node.children) {
        flatten(child, flatNodes[flatNodes.length - 1]);
      }
    }
  };
  flatten(nodes[0]);

  let currentIndex = 0;

  const mockTree = {
    walk: () => ({
      get currentNode() { return { type: flatNodes[currentIndex].type }; },
      gotoFirstChild: () => {
        const node = flatNodes[currentIndex];
        if (node.originalChildren && node.originalChildren.length > 0) {
          currentIndex++;
          return true;
        }
        return false;
      },
      gotoNextSibling: () => {
        const current = flatNodes[currentIndex];
        const parent = current.parent;
        if (!parent) return false;

        const siblings = parent.originalChildren || [];
        const currentInSiblings = siblings.findIndex(s => s.type === current.type);
        if (currentInSiblings < siblings.length - 1) {
          // Move to next sibling
          for (let i = currentIndex + 1; i < flatNodes.length; i++) {
            if (flatNodes[i].parent === parent) {
              currentIndex = i;
              return true;
            }
          }
        }
        return false;
      },
      gotoParent: () => {
        const current = flatNodes[currentIndex];
        if (current.parent) {
          for (let i = 0; i < flatNodes.length; i++) {
            if (flatNodes[i] === current.parent) {
              currentIndex = i;
              return true;
            }
          }
        }
        return false;
      }
    })
  };

  const types = get_types_from_tree(mockTree);

  t.assert.eq(Array.isArray(types), true, 'Should return an array');
  t.assert.eq(types.includes('program'), true, 'Should include program type');
});

// ============ prepare_entities_for_nodes tests ============

await test('prepare_entities_for_nodes creates entity objects for C', async (t) => {
  const mockNodes = {
    function_definition: [
      {
        node: {
          type: 'function_definition',
          childCount: 1,
          child: (i) => ({ type: 'identifier', text: 'test_func' })
        },
        content: 'void test_func() {}',
        start_line: 1,
        end_line: 3,
        start_position: 0,
        end_position: 1
      }
    ],
    comment: [],
    parameter_list: [
      {
        content: '()',
        start_line: 1,
        end_line: 1
      }
    ]
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.c',
    language: 'c'
  });

  t.assert.eq(Array.isArray(entities), true, 'Should return an array');
  t.assert.eq(entities.length > 0, true, 'Should create at least one entity');
  t.assert.eq(entities[0].project_id, 1, 'Should set correct project_id');
  t.assert.eq(entities[0].filename, 'test.c', 'Should set correct filename');
  t.assert.eq(entities[0].language, 'c', 'Should set correct language');
  t.assert.eq(entities[0].type, 'function', 'Should set type to function');
});

await test('prepare_entities_for_nodes associates comments', async (t) => {
  const mockNodes = {
    function_definition: [
      {
        node: {
          type: 'function_definition',
          childCount: 1,
          child: (i) => ({ type: 'identifier', text: 'documented_func' })
        },
        content: 'void documented_func() {}',
        start_line: 3,
        end_line: 5,
        start_position: 0,
        end_position: 1
      }
    ],
    comment: [
      {
        content: '// This is a comment',
        start_line: 2,
        end_line: 2
      }
    ],
    parameter_list: []
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.c',
    language: 'c'
  });

  t.assert.eq(entities[0].comment, '// This is a comment', 'Should associate comment with function');
});

await test('prepare_entities_for_nodes handles JavaScript arrow functions', async (t) => {
  const mockNodes = {
    function_definition: [
      {
        node: {
          type: 'arrow_function',
          childCount: 0,
          child: () => null,
          parent: {
            type: 'variable_declarator',
            childCount: 2,
            child: (i) => i === 0 ? { type: 'identifier', text: 'myArrowFunc' } : null
          }
        },
        content: 'const myArrowFunc = () => {}',
        start_line: 1,
        end_line: 1,
        start_position: 0,
        end_position: 28
      }
    ],
    comment: [],
    parameter_list: []
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.js',
    language: 'javascript'
  });

  t.assert.eq(entities.length, 1, 'Should create one entity');
  t.assert.eq(entities[0].symbol, 'myArrowFunc', 'Should extract arrow function name from parent');
});

await test('prepare_entities_for_nodes handles Python functions', async (t) => {
  const mockNodes = {
    function_definition: [
      {
        node: {
          type: 'function_definition',
          childCount: 2,
          child: (i) => i === 0 ? { type: 'def' } : { type: 'identifier', text: 'my_python_func' }
        },
        content: 'def my_python_func():\n    pass',
        start_line: 1,
        end_line: 2,
        start_position: 0,
        end_position: 4
      }
    ],
    comment: [],
    parameter_list: [
      {
        content: '()',
        start_line: 1,
        end_line: 1
      }
    ]
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.py',
    language: 'python'
  });

  t.assert.eq(entities.length, 1, 'Should create one entity');
  t.assert.eq(entities[0].symbol, 'my_python_func', 'Should extract Python function name');
  t.assert.eq(entities[0].language, 'python', 'Should set language to python');
});

await test('prepare_entities_for_nodes handles parameters', async (t) => {
  const mockNodes = {
    function_definition: [
      {
        node: {
          type: 'function_definition',
          childCount: 1,
          child: (i) => ({ type: 'identifier', text: 'func_with_params' })
        },
        content: 'void func_with_params(int a, int b) {}',
        start_line: 1,
        end_line: 1,
        start_position: 0,
        end_position: 38
      }
    ],
    comment: [],
    parameter_list: [
      {
        content: '(int a,  int b)',
        start_line: 1,
        end_line: 1
      }
    ]
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.c',
    language: 'c'
  });

  t.assert.eq(entities[0].parameters, '(int a, int b)', 'Should capture and normalize parameters');
});

await test('prepare_entities_for_nodes handles empty function list', async (t) => {
  const mockNodes = {
    function_definition: [],
    comment: [],
    parameter_list: []
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'empty.c',
    language: 'c'
  });

  t.assert.eq(entities.length, 0, 'Should return empty array for no functions');
});

await test('prepare_entities_for_nodes handles JavaScript function declarations', async (t) => {
  const mockNodes = {
    function_definition: [
      {
        node: {
          type: 'function_declaration',
          childCount: 2,
          child: (i) => i === 1 ? { type: 'identifier', text: 'myFunction' } : { type: 'function' }
        },
        content: 'function myFunction() {}',
        start_line: 1,
        end_line: 1,
        start_position: 0,
        end_position: 24
      }
    ],
    comment: [],
    parameter_list: []
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.js',
    language: 'javascript'
  });

  t.assert.eq(entities.length, 1, 'Should create one entity');
  t.assert.eq(entities[0].symbol, 'myFunction', 'Should extract function declaration name');
});

await test('prepare_entities_for_nodes handles JavaScript method definitions', async (t) => {
  const mockNodes = {
    function_definition: [
      {
        node: {
          type: 'method_definition',
          childCount: 2,
          child: (i) => i === 0 ? { type: 'property_identifier', text: 'myMethod' } : null
        },
        content: 'myMethod() {}',
        start_line: 1,
        end_line: 1,
        start_position: 0,
        end_position: 13
      }
    ],
    comment: [],
    parameter_list: []
  };

  const entities = prepare_entities_for_nodes({
    project_id: 1,
    nodes: mockNodes,
    filename: 'test.js',
    language: 'javascript'
  });

  t.assert.eq(entities.length, 1, 'Should create one entity');
  t.assert.eq(entities[0].symbol, 'myMethod', 'Should extract method name');
});
