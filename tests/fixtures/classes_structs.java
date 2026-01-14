/**
 * Java test fixture for class and interface parsing.
 * Tests various class and interface declaration styles.
 */

package com.example.test;

import java.util.ArrayList;
import java.util.List;

// Interface definition
interface Animal {
    String speak();
    void move();
}

// Interface with default method
interface Greetable {
    String getName();

    default String greet() {
        return "Hello, " + getName() + "!";
    }
}

// Interface extending interface
interface Pet extends Animal, Greetable {
    String getOwner();
}

// Simple class
class Point {
    private int x;
    private int y;

    public Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    public int getX() {
        return x;
    }

    public int getY() {
        return y;
    }

    public double distanceTo(Point other) {
        int dx = this.x - other.x;
        int dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

// Abstract class
abstract class Shape {
    protected String color;

    public Shape(String color) {
        this.color = color;
    }

    public abstract double area();
    public abstract double perimeter();

    public String getColor() {
        return color;
    }
}

// Class extending abstract class
class Rectangle extends Shape {
    private double width;
    private double height;

    public Rectangle(String color, double width, double height) {
        super(color);
        this.width = width;
        this.height = height;
    }

    @Override
    public double area() {
        return width * height;
    }

    @Override
    public double perimeter() {
        return 2 * (width + height);
    }
}

// Class implementing interface
class Dog implements Animal, Greetable {
    private String name;
    private String breed;

    public Dog(String name, String breed) {
        this.name = name;
        this.breed = breed;
    }

    @Override
    public String speak() {
        return name + " barks";
    }

    @Override
    public void move() {
        System.out.println(name + " runs");
    }

    @Override
    public String getName() {
        return name;
    }

    public String getBreed() {
        return breed;
    }
}

// Generic class
class Container<T> {
    private List<T> items;

    public Container() {
        this.items = new ArrayList<>();
    }

    public void add(T item) {
        items.add(item);
    }

    public T get(int index) {
        return items.get(index);
    }

    public List<T> getAll() {
        return new ArrayList<>(items);
    }
}

// Enum
enum Color {
    RED("FF0000"),
    GREEN("00FF00"),
    BLUE("0000FF");

    private final String hexCode;

    Color(String hexCode) {
        this.hexCode = hexCode;
    }

    public String getHexCode() {
        return hexCode;
    }
}

// Inner class
class Outer {
    private int value;

    public Outer(int value) {
        this.value = value;
    }

    class Inner {
        public int getValue() {
            return value;
        }
    }

    static class StaticInner {
        private int data;

        public StaticInner(int data) {
            this.data = data;
        }

        public int getData() {
            return data;
        }
    }
}

// Record (Java 14+, struct-like)
// record User(long id, String name, String email) {}

// Final class
final class Constants {
    public static final double PI = 3.14159;
    public static final int MAX_SIZE = 100;

    private Constants() {
        // Prevent instantiation
    }
}

// Main class
public class Main {
    public static void main(String[] args) {
        Point p1 = new Point(0, 0);
        Point p2 = new Point(3, 4);
        System.out.println("Distance: " + p1.distanceTo(p2));

        Dog dog = new Dog("Buddy", "Labrador");
        System.out.println(dog.speak());
        System.out.println(dog.greet());

        Rectangle rect = new Rectangle("red", 5, 10);
        System.out.println("Area: " + rect.area());

        Container<Integer> container = new Container<>();
        container.add(42);
        System.out.println("Container: " + container.get(0));

        System.out.println("Red hex: " + Color.RED.getHexCode());
    }
}
