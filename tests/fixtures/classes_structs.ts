/**
 * TypeScript test fixture for class and interface parsing.
 * Tests various class and interface declaration styles.
 */

// Interface definition
interface Animal {
  name: string;
  speak(): string;
}

// Interface with optional properties
interface Config {
  host: string;
  port: number;
  secure?: boolean;
  timeout?: number;
}

// Interface extending another interface
interface Pet extends Animal {
  owner: string;
  play(): void;
}

// Simple class implementing interface
class Dog implements Animal {
  constructor(public name: string, public breed: string) {}

  speak(): string {
    return `${this.name} barks`;
  }

  fetch(): string {
    return `${this.name} fetches the ball`;
  }
}

// Abstract class
abstract class Shape {
  abstract area(): number;
  abstract perimeter(): number;

  describe(): string {
    return `Area: ${this.area()}, Perimeter: ${this.perimeter()}`;
  }
}

// Class extending abstract class
class Rectangle extends Shape {
  constructor(private width: number, private height: number) {
    super();
  }

  area(): number {
    return this.width * this.height;
  }

  perimeter(): number {
    return 2 * (this.width + this.height);
  }
}

// Generic class
class Container<T> {
  private items: T[] = [];

  add(item: T): void {
    this.items.push(item);
  }

  get(index: number): T | undefined {
    return this.items[index];
  }

  getAll(): T[] {
    return [...this.items];
  }
}

// Class with static members
class MathUtils {
  static readonly PI = 3.14159;

  static add(a: number, b: number): number {
    return a + b;
  }

  static circleArea(radius: number): number {
    return this.PI * radius ** 2;
  }
}

// Type alias (struct-like)
type Point = {
  x: number;
  y: number;
  label?: string;
};

// Type alias for union
type Result<T> = { success: true; data: T } | { success: false; error: string };

// Enum
enum Color {
  Red = 'RED',
  Green = 'GREEN',
  Blue = 'BLUE',
}

// Const enum
const enum Direction {
  Up,
  Down,
  Left,
  Right,
}

// Class with decorators (if enabled)
class Service {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }
}

export {
  Animal,
  Config,
  Pet,
  Dog,
  Shape,
  Rectangle,
  Container,
  MathUtils,
  Point,
  Result,
  Color,
  Direction,
  Service,
};
