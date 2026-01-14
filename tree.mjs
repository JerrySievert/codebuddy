// tree-sitter-c-demo.js
import Parser from 'tree-sitter';
import C from 'tree-sitter-c';
console.log(JSON.stringify(Parser, null, 2));

(async () => {
  // 1️⃣ Create a parser & load the C grammar
  const parser = new Parser();
  parser.setLanguage(C);

  // 2️⃣ Sample C source code
  const code = `
#include <stdio.h>

int add(int a, int b) {
  return a + b;
}

int main(void) {
  printf("Sum: %d\\n", add(3, 4));
  return 0;
}
`;

  // 3️⃣ Parse the code into a syntax tree
  const tree = parser.parse(code);
  console.log(JSON.stringify(C, null, 2));
  // 4️⃣ Define a Tree‑Sitter query
  //    – captures function names and parameters
  const query = parser.Query(`
    (function_definition
      name: (type_identifier) @func.name
      parameters: (parameter_list) @func.params
    ) @func.def
  `);

  // 5️⃣ Run the query against the parse tree
  const captures = query.matches(tree.rootNode);

  // 6️⃣ Output the results
  console.log('Functions found:');
  for (const capture of captures) {
    // capture.captures[0] refers to @func.def
    const nameCapture = capture.captures.find((c) => c.name === 'func.name');
    const paramsCapture = capture.captures.find(
      (c) => c.name === 'func.params'
    );

    const funcName = nameCapture.node.text;
    const funcParams = paramsCapture.node.text;

    console.log(`- ${funcName}(${funcParams})`);
  }
})();
