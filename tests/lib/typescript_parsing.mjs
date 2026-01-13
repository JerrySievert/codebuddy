'use strict';

import { get_nodes_from_source, get_return_type_from_function } from '../../lib/functions.mjs';
import { test } from 'st';

// ============ TypeScript parsing tests ============

await test('TypeScript: parses function declarations with types', async (t) => {
  const source = `function greet(name: string): string {
    return "Hello, " + name;
}

function add(a: number, b: number): number {
    return a + b;
}`;

  const nodes = get_nodes_from_source(source, 'functions.ts');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find function declarations');

  const funcNames = nodes.function_definition.map(f => f.content);
  t.assert.eq(funcNames.some(f => f.includes('greet')), true, 'Should find greet function');
  t.assert.eq(funcNames.some(f => f.includes('add')), true, 'Should find add function');
});

await test('TypeScript: parses arrow functions with types', async (t) => {
  const source = `const multiply = (a: number, b: number): number => a * b;

const sayHello = (name: string): void => {
    console.log("Hello, " + name);
};`;

  const nodes = get_nodes_from_source(source, 'arrows.ts');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find arrow functions');
});

await test('TypeScript: parses class methods with types', async (t) => {
  const source = `class Calculator {
    private value: number = 0;

    add(n: number): number {
        this.value += n;
        return this.value;
    }

    getValue(): number {
        return this.value;
    }

    reset(): void {
        this.value = 0;
    }
}`;

  const nodes = get_nodes_from_source(source, 'Calculator.ts');

  t.assert.eq(nodes.function_definition.length >= 3, true, 'Should find class methods');
});

await test('TypeScript: parses interfaces and type annotations', async (t) => {
  const source = `interface User {
    name: string;
    age: number;
}

function createUser(name: string, age: number): User {
    return { name, age };
}

const printUser = (user: User): void => {
    console.log(user.name);
};`;

  const nodes = get_nodes_from_source(source, 'types.ts');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find functions with interface types');
});

await test('TypeScript: extracts call expressions', async (t) => {
  const source = `function main(): void {
    console.log("Hello");
    const result = calculate(1, 2);
    helper.process();
}`;

  const nodes = get_nodes_from_source(source, 'main.ts');

  t.assert.eq(nodes.call_expression.length >= 1, true, 'Should find call expressions');
});

await test('TypeScript: extracts comments', async (t) => {
  const source = `// This is a single line comment
function foo(): void {}

/* This is a
   multi-line comment */
function bar(): string {
    return "bar";
}

/**
 * JSDoc comment
 * @param name The name
 */
function baz(name: string): void {}`;

  const nodes = get_nodes_from_source(source, 'comments.ts');

  t.assert.eq(nodes.comment.length >= 1, true, 'Should find comments');
});

await test('TypeScript: extracts formal parameters', async (t) => {
  const source = `function process(
    input: string,
    count: number,
    options?: { flag: boolean }
): string {
    return input;
}`;

  const nodes = get_nodes_from_source(source, 'params.ts');

  t.assert.eq(nodes.parameter_list.length >= 1, true, 'Should find formal parameters');
});

await test('TypeScript: parses async functions', async (t) => {
  const source = `async function fetchData(url: string): Promise<string> {
    const response = await fetch(url);
    return response.text();
}

const fetchJson = async <T>(url: string): Promise<T> => {
    const response = await fetch(url);
    return response.json();
};`;

  const nodes = get_nodes_from_source(source, 'async.ts');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find async functions');
});

await test('TypeScript: parses generic functions', async (t) => {
  const source = `function identity<T>(arg: T): T {
    return arg;
}

function map<T, U>(arr: T[], fn: (item: T) => U): U[] {
    return arr.map(fn);
}`;

  const nodes = get_nodes_from_source(source, 'generics.ts');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find generic functions');
});

await test('TypeScript: get_return_type_from_function extracts type annotations', async (t) => {
  const source = `function getString(): string {
    return "hello";
}

function getNumber(): number {
    return 42;
}

function getVoid(): void {
    console.log("void");
}`;

  const nodes = get_nodes_from_source(source, 'returns.ts');

  const stringFunc = nodes.function_definition.find(f => f.content.includes('getString'));
  const numberFunc = nodes.function_definition.find(f => f.content.includes('getNumber'));
  const voidFunc = nodes.function_definition.find(f => f.content.includes('getVoid'));

  if (stringFunc) {
    const returnType = get_return_type_from_function(stringFunc, 'typescript');
    t.assert.eq(returnType, 'string', 'Should extract string return type');
  }

  if (numberFunc) {
    const returnType = get_return_type_from_function(numberFunc, 'typescript');
    t.assert.eq(returnType, 'number', 'Should extract number return type');
  }

  if (voidFunc) {
    const returnType = get_return_type_from_function(voidFunc, 'typescript');
    t.assert.eq(returnType, 'void', 'Should extract void return type');
  }
});

// ============ TSX parsing tests ============

await test('TSX: parses React components', async (t) => {
  const source = `import React from 'react';

interface Props {
    name: string;
}

function Greeting({ name }: Props): JSX.Element {
    return <div>Hello, {name}!</div>;
}

const Button = ({ onClick }: { onClick: () => void }): JSX.Element => {
    return <button onClick={onClick}>Click me</button>;
};`;

  const nodes = get_nodes_from_source(source, 'Component.tsx');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find React components');
});

await test('TSX: parses class components', async (t) => {
  const source = `import React, { Component } from 'react';

interface State {
    count: number;
}

class Counter extends Component<{}, State> {
    state: State = { count: 0 };

    increment(): void {
        this.setState({ count: this.state.count + 1 });
    }

    render(): JSX.Element {
        return <div>{this.state.count}</div>;
    }
}`;

  const nodes = get_nodes_from_source(source, 'Counter.tsx');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find class component methods');
});
