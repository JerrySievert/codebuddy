/**
 * JavaScript test fixture for codebuddy parser testing.
 * Tests various function declaration styles.
 */

// Regular function declaration
function greet(name) {
  return `Hello, ${name}!`;
}

// Function with multiple parameters
function add(a, b) {
  return a + b;
}

// Arrow function assigned to variable
const multiply = (x, y) => {
  return x * y;
};

// Arrow function with implicit return
const square = (n) => n * n;

// Function expression
const divide = function(a, b) {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
};

// Async function
async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}

// Class with methods
class Calculator {
  constructor(initialValue = 0) {
    this.value = initialValue;
  }

  // Instance method
  add(n) {
    this.value += n;
    return this;
  }

  // Another instance method
  subtract(n) {
    this.value -= n;
    return this;
  }

  // Static method
  static create(value) {
    return new Calculator(value);
  }

  // Getter
  get result() {
    return this.value;
  }
}

// Higher-order function
function createMultiplier(factor) {
  return function(n) {
    return n * factor;
  };
}

// Function that calls other functions
function calculate(a, b, operation) {
  switch (operation) {
    case 'add':
      return add(a, b);
    case 'multiply':
      return multiply(a, b);
    case 'divide':
      return divide(a, b);
    default:
      return greet('Unknown operation');
  }
}

// Export functions
module.exports = {
  greet,
  add,
  multiply,
  square,
  divide,
  fetchData,
  Calculator,
  createMultiplier,
  calculate
};
