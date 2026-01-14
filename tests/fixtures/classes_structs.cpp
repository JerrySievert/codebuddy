/**
 * C++ test fixture for class and struct parsing.
 * Tests various class, struct, and method declaration styles.
 */

#include <iostream>
#include <string>
#include <vector>

// Simple struct
struct Point {
  int x;
  int y;

  // Member function
  double distanceTo(const Point &other) const {
    int dx = x - other.x;
    int dy = y - other.y;
    return sqrt(dx * dx + dy * dy);
  }
};

// Simple class
class Animal {
public:
  Animal(const std::string &name) : name_(name) {}

  virtual std::string speak( ) const { return name_ + " makes a sound"; }

  std::string getName( ) const { return name_; }

protected:
  std::string name_;
};

// Class with inheritance
class Dog : public Animal {
public:
  Dog(const std::string &name, const std::string &breed)
      : Animal(name), breed_(breed) {}

  std::string speak( ) const override { return name_ + " barks"; }

  std::string getBreed( ) const { return breed_; }

private:
  std::string breed_;
};

// Template class
template <typename T> class Container {
public:
  void add(const T &item) { items_.push_back(item); }

  T get(size_t index) const { return items_[ index ]; }

  size_t size( ) const { return items_.size( ); }

private:
  std::vector<T> items_;
};

// Abstract class
class Shape {
public:
  virtual ~Shape( )                 = default;
  virtual double area( ) const      = 0;
  virtual double perimeter( ) const = 0;
};

// Class implementing abstract class
class Rectangle : public Shape {
public:
  Rectangle(double width, double height) : width_(width), height_(height) {}

  double area( ) const override { return width_ * height_; }

  double perimeter( ) const override { return 2 * (width_ + height_); }

private:
  double width_;
  double height_;
};

// Namespace with classes
namespace utils {
class Logger {
public:
  void log(const std::string &message) { std::cout << message << std::endl; }
};

struct Config {
  std::string host;
  int port;
  bool secure;
};
} // namespace utils

// Free function
void printPoint(const Point &p) {
  std::cout << "Point(" << p.x << ", " << p.y << ")" << std::endl;
}

int main( ) {
  Point p1{ 0, 0 };
  Point p2{ 3, 4 };
  printPoint(p1);

  Dog dog("Buddy", "Labrador");
  std::cout << dog.speak( ) << std::endl;

  Container<int> container;
  container.add(42);
  std::cout << "Container: " << container.get(0) << std::endl;

  Rectangle rect(5, 10);
  std::cout << "Area: " << rect.area( ) << std::endl;

  return 0;
}
