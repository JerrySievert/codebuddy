/**
 * JavaScript test fixture for class parsing.
 * Tests various class declaration styles.
 */

// Simple class
class Animal {
  constructor(name) {
    this.name = name;
  }

  speak() {
    return `${this.name} makes a sound`;
  }
}

// Class with inheritance
class Dog extends Animal {
  constructor(name, breed) {
    super(name);
    this.breed = breed;
  }

  speak() {
    return `${this.name} barks`;
  }

  fetch() {
    return `${this.name} fetches the ball`;
  }
}

// Class with static methods and properties
class MathUtils {
  static PI = 3.14159;

  static add(a, b) {
    return a + b;
  }

  static multiply(a, b) {
    return a * b;
  }
}

// Class with getters and setters
class Rectangle {
  constructor(width, height) {
    this._width = width;
    this._height = height;
  }

  get width() {
    return this._width;
  }

  set width(value) {
    this._width = value;
  }

  get area() {
    return this._width * this._height;
  }
}

// Class expression assigned to variable
const Vehicle = class {
  constructor(type) {
    this.type = type;
  }

  describe() {
    return `This is a ${this.type}`;
  }
};

// Anonymous class expression
const createClass = () => class {
  getValue() {
    return 42;
  }
};

module.exports = {
  Animal,
  Dog,
  MathUtils,
  Rectangle,
  Vehicle,
  createClass
};
