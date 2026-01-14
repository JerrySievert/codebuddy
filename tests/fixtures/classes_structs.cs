/**
 * C# test fixture for class, struct, and interface parsing.
 * Tests various declaration styles.
 */

using System;
using System.Collections.Generic;

namespace TestFixtures
{
    // Interface definition
    public interface IAnimal
    {
        string Speak();
        void Move();
    }

    // Interface with properties
    public interface IIdentifiable
    {
        int Id { get; }
        string Name { get; set; }
    }

    // Interface extending interface
    public interface IPet : IAnimal, IIdentifiable
    {
        string Owner { get; set; }
    }

    // Simple struct
    public struct Point
    {
        public int X;
        public int Y;

        public Point(int x, int y)
        {
            X = x;
            Y = y;
        }

        public double DistanceTo(Point other)
        {
            int dx = X - other.X;
            int dy = Y - other.Y;
            return Math.Sqrt(dx * dx + dy * dy);
        }
    }

    // Struct with properties
    public struct Rectangle
    {
        public double Width { get; set; }
        public double Height { get; set; }

        public Rectangle(double width, double height)
        {
            Width = width;
            Height = height;
        }

        public double Area => Width * Height;
        public double Perimeter => 2 * (Width + Height);
    }

    // Readonly struct
    public readonly struct ImmutablePoint
    {
        public readonly int X;
        public readonly int Y;

        public ImmutablePoint(int x, int y)
        {
            X = x;
            Y = y;
        }
    }

    // Abstract class
    public abstract class Shape
    {
        public string Color { get; set; }

        protected Shape(string color)
        {
            Color = color;
        }

        public abstract double Area();
        public abstract double Perimeter();

        public virtual string Describe()
        {
            return $"A {Color} shape";
        }
    }

    // Class extending abstract class
    public class Circle : Shape
    {
        public double Radius { get; set; }

        public Circle(string color, double radius) : base(color)
        {
            Radius = radius;
        }

        public override double Area()
        {
            return Math.PI * Radius * Radius;
        }

        public override double Perimeter()
        {
            return 2 * Math.PI * Radius;
        }
    }

    // Class implementing interface
    public class Dog : IAnimal
    {
        public string Name { get; set; }
        public string Breed { get; set; }

        public Dog(string name, string breed)
        {
            Name = name;
            Breed = breed;
        }

        public string Speak()
        {
            return $"{Name} barks";
        }

        public void Move()
        {
            Console.WriteLine($"{Name} runs");
        }
    }

    // Generic class
    public class Container<T>
    {
        private List<T> items = new List<T>();

        public void Add(T item)
        {
            items.Add(item);
        }

        public T Get(int index)
        {
            return items[index];
        }

        public IEnumerable<T> GetAll()
        {
            return items;
        }
    }

    // Generic class with constraints
    public class Repository<T> where T : class, IIdentifiable, new()
    {
        private Dictionary<int, T> storage = new Dictionary<int, T>();

        public void Add(T item)
        {
            storage[item.Id] = item;
        }

        public T Get(int id)
        {
            return storage.TryGetValue(id, out var item) ? item : null;
        }
    }

    // Enum
    public enum Color
    {
        Red,
        Green,
        Blue
    }

    // Enum with values
    public enum HttpStatus
    {
        OK = 200,
        NotFound = 404,
        InternalServerError = 500
    }

    // Static class
    public static class MathUtils
    {
        public const double PI = 3.14159;

        public static int Add(int a, int b)
        {
            return a + b;
        }

        public static double CircleArea(double radius)
        {
            return PI * radius * radius;
        }
    }

    // Partial class
    public partial class PartialClass
    {
        public int Part1Property { get; set; }

        public void Part1Method()
        {
            Console.WriteLine("Part 1");
        }
    }

    public partial class PartialClass
    {
        public int Part2Property { get; set; }

        public void Part2Method()
        {
            Console.WriteLine("Part 2");
        }
    }

    // Sealed class
    public sealed class FinalClass
    {
        public string Value { get; }

        public FinalClass(string value)
        {
            Value = value;
        }
    }

    // Record (C# 9+, struct-like with value semantics)
    // public record User(int Id, string Name, string Email);

    // Main class
    public class Program
    {
        public static void Main(string[] args)
        {
            var p1 = new Point(0, 0);
            var p2 = new Point(3, 4);
            Console.WriteLine($"Distance: {p1.DistanceTo(p2)}");

            var dog = new Dog("Buddy", "Labrador");
            Console.WriteLine(dog.Speak());

            var circle = new Circle("red", 5);
            Console.WriteLine($"Area: {circle.Area()}");

            var container = new Container<int>();
            container.Add(42);
            Console.WriteLine($"Container: {container.Get(0)}");
        }
    }
}
