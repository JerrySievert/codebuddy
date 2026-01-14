// Go test fixture for struct and interface parsing.
// Tests various struct and interface declaration styles.
package main

import (
	"fmt"
	"math"
)

// Simple struct
type Point struct {
	X int
	Y int
}

// Struct with tags
type User struct {
	ID       int    `json:"id" db:"user_id"`
	Name     string `json:"name" db:"user_name"`
	Email    string `json:"email" db:"email"`
	IsActive bool   `json:"is_active" db:"active"`
}

// Struct with embedded struct
type Employee struct {
	User
	Department string
	Salary     float64
}

// Interface definition
type Animal interface {
	Speak() string
	Move() string
}

// Interface with multiple methods
type Shape interface {
	Area() float64
	Perimeter() float64
}

// Interface embedding
type ReadWriter interface {
	Reader
	Writer
}

type Reader interface {
	Read(p []byte) (n int, err error)
}

type Writer interface {
	Write(p []byte) (n int, err error)
}

// Struct implementing interface
type Dog struct {
	Name  string
	Breed string
}

func (d Dog) Speak() string {
	return fmt.Sprintf("%s barks", d.Name)
}

func (d Dog) Move() string {
	return fmt.Sprintf("%s runs", d.Name)
}

// Struct with methods
type Rectangle struct {
	Width  float64
	Height float64
}

func (r Rectangle) Area() float64 {
	return r.Width * r.Height
}

func (r Rectangle) Perimeter() float64 {
	return 2 * (r.Width + r.Height)
}

// Struct with pointer receiver methods
type Counter struct {
	value int
}

func (c *Counter) Increment() {
	c.value++
}

func (c *Counter) Decrement() {
	c.value--
}

func (c *Counter) Value() int {
	return c.value
}

// Generic struct (Go 1.18+)
type Container[T any] struct {
	items []T
}

func (c *Container[T]) Add(item T) {
	c.items = append(c.items, item)
}

func (c *Container[T]) Get(index int) T {
	return c.items[index]
}

// Generic interface
type Comparable[T any] interface {
	Compare(other T) int
}

// Empty struct (used for signaling)
type Signal struct{}

// Struct with anonymous fields
type Config struct {
	string
	int
	bool
}

// Type alias
type Celsius float64
type Fahrenheit float64

func (c Celsius) ToFahrenheit() Fahrenheit {
	return Fahrenheit(c*9/5 + 32)
}

// Circle struct for Shape interface
type Circle struct {
	Radius float64
}

func (c Circle) Area() float64 {
	return math.Pi * c.Radius * c.Radius
}

func (c Circle) Perimeter() float64 {
	return 2 * math.Pi * c.Radius
}

func main() {
	p := Point{X: 10, Y: 20}
	fmt.Printf("Point: %+v\n", p)

	dog := Dog{Name: "Buddy", Breed: "Labrador"}
	fmt.Println(dog.Speak())

	rect := Rectangle{Width: 5, Height: 10}
	fmt.Printf("Area: %.2f\n", rect.Area())

	counter := &Counter{}
	counter.Increment()
	counter.Increment()
	fmt.Printf("Counter: %d\n", counter.Value())
}
