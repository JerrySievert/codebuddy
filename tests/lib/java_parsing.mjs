'use strict';

import { get_nodes_from_source, get_return_type_from_function } from '../../lib/functions.mjs';
import { test } from 'st';

// ============ Java parsing tests ============

await test('Java: parses method declarations', async (t) => {
  const source = `public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }

    public void printResult() {
        System.out.println("Result");
    }
}`;

  const nodes = get_nodes_from_source(source, 'Calculator.java');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find method declarations');

  const methodNames = nodes.function_definition.map(f => f.content);
  t.assert.eq(methodNames.some(m => m.includes('add')), true, 'Should find add method');
  t.assert.eq(methodNames.some(m => m.includes('printResult')), true, 'Should find printResult method');
});

await test('Java: parses constructor declarations', async (t) => {
  const source = `public class Person {
    private String name;

    public Person(String name) {
        this.name = name;
    }

    public String getName() {
        return this.name;
    }
}`;

  const nodes = get_nodes_from_source(source, 'Person.java');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find constructor and method');

  const hasConstructor = nodes.function_definition.some(f => f.content.includes('Person('));
  t.assert.eq(hasConstructor, true, 'Should find constructor');
});

await test('Java: extracts method invocations', async (t) => {
  const source = `public class Main {
    public void run() {
        System.out.println("Hello");
        helper.doSomething();
        calculate(1, 2);
    }
}`;

  const nodes = get_nodes_from_source(source, 'Main.java');

  t.assert.eq(nodes.call_expression.length >= 1, true, 'Should find method invocations');
});

await test('Java: extracts comments', async (t) => {
  const source = `public class Example {
    // This is a line comment
    public void method1() {}

    /* This is a block comment */
    public void method2() {}

    /**
     * This is a Javadoc comment
     */
    public void method3() {}
}`;

  const nodes = get_nodes_from_source(source, 'Example.java');

  t.assert.eq(nodes.comment.length >= 1, true, 'Should find comments');
});

await test('Java: extracts formal parameters', async (t) => {
  const source = `public class Service {
    public void process(String input, int count, boolean flag) {
        // process
    }
}`;

  const nodes = get_nodes_from_source(source, 'Service.java');

  t.assert.eq(nodes.parameter_list.length >= 1, true, 'Should find formal parameters');
});

await test('Java: get_return_type_from_function returns correct types', async (t) => {
  const source = `public class Types {
    public int getInt() { return 0; }
    public String getString() { return ""; }
    public void doVoid() {}
}`;

  const nodes = get_nodes_from_source(source, 'Types.java');

  const intMethod = nodes.function_definition.find(f => f.content.includes('getInt'));
  const stringMethod = nodes.function_definition.find(f => f.content.includes('getString'));
  const voidMethod = nodes.function_definition.find(f => f.content.includes('doVoid'));

  if (intMethod) {
    const returnType = get_return_type_from_function(intMethod, 'java');
    t.assert.eq(returnType, 'int', 'Should return int for getInt');
  }

  if (voidMethod) {
    const returnType = get_return_type_from_function(voidMethod, 'java');
    t.assert.eq(returnType, 'void', 'Should return void for doVoid');
  }
});

await test('Java: parses static methods', async (t) => {
  const source = `public class Utils {
    public static int max(int a, int b) {
        return a > b ? a : b;
    }

    public static void main(String[] args) {
        System.out.println("Hello");
    }
}`;

  const nodes = get_nodes_from_source(source, 'Utils.java');

  t.assert.eq(nodes.function_definition.length >= 2, true, 'Should find static methods');

  const hasMain = nodes.function_definition.some(f => f.content.includes('main'));
  t.assert.eq(hasMain, true, 'Should find main method');
});
