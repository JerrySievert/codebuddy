/// Rust test fixture for struct and trait parsing.
/// Tests various struct, enum, and trait declaration styles.

// Simple struct
struct Point {
    x: i32,
    y: i32,
}

// Tuple struct
struct Color(u8, u8, u8);

// Unit struct
struct Marker;

// Struct with generics
struct Container<T> {
    item: T,
}

// Struct with lifetime
struct Borrowed<'a> {
    data: &'a str,
}

// Struct with derive macros
#[derive(Debug, Clone, PartialEq)]
struct User {
    id: u64,
    name: String,
    email: String,
}

// Enum (like tagged union)
enum Message {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
    ChangeColor(u8, u8, u8),
}

// Enum with data
enum Result<T, E> {
    Ok(T),
    Err(E),
}

// Trait definition (like interface)
trait Animal {
    fn speak(&self) -> String;
    fn move_to(&self, x: i32, y: i32);
}

// Trait with default implementation
trait Greet {
    fn name(&self) -> &str;

    fn greet(&self) -> String {
        format!("Hello, {}!", self.name())
    }
}

// Trait with associated type
trait Iterator {
    type Item;
    fn next(&mut self) -> Option<Self::Item>;
}

// Generic trait
trait Comparable<T> {
    fn compare(&self, other: &T) -> i32;
}

// Struct implementing traits
struct Dog {
    name: String,
    breed: String,
}

impl Animal for Dog {
    fn speak(&self) -> String {
        format!("{} barks", self.name)
    }

    fn move_to(&self, x: i32, y: i32) {
        println!("{} moves to ({}, {})", self.name, x, y);
    }
}

impl Greet for Dog {
    fn name(&self) -> &str {
        &self.name
    }
}

// Struct with methods
impl Point {
    // Associated function (constructor)
    fn new(x: i32, y: i32) -> Self {
        Point { x, y }
    }

    // Method
    fn distance(&self, other: &Point) -> f64 {
        let dx = (self.x - other.x) as f64;
        let dy = (self.y - other.y) as f64;
        (dx * dx + dy * dy).sqrt()
    }

    // Mutable method
    fn translate(&mut self, dx: i32, dy: i32) {
        self.x += dx;
        self.y += dy;
    }
}

impl<T> Container<T> {
    fn new(item: T) -> Self {
        Container { item }
    }

    fn get(&self) -> &T {
        &self.item
    }

    fn into_inner(self) -> T {
        self.item
    }
}

// Struct with public fields
pub struct PublicStruct {
    pub field1: i32,
    pub field2: String,
}

// Newtype pattern
struct Meters(f64);
struct Kilometers(f64);

impl Meters {
    fn to_kilometers(&self) -> Kilometers {
        Kilometers(self.0 / 1000.0)
    }
}

fn main() {
    let p1 = Point::new(0, 0);
    let p2 = Point::new(3, 4);
    println!("Distance: {}", p1.distance(&p2));

    let dog = Dog {
        name: String::from("Buddy"),
        breed: String::from("Labrador"),
    };
    println!("{}", dog.speak());
    println!("{}", dog.greet());

    let color = Color(255, 128, 0);
    let container = Container::new(42);
    println!("Container: {}", container.get());

    let user = User {
        id: 1,
        name: String::from("Alice"),
        email: String::from("alice@example.com"),
    };
    println!("User: {:?}", user);
}
