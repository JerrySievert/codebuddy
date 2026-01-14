package main

import (
	"fmt"
	"errors"
)

// SimpleFunction is a basic function
func SimpleFunction() {
	fmt.Println("Hello, World!")
}

// Add adds two integers
func Add(a int, b int) int {
	return a + b
}

// Divide divides two numbers with error handling
func Divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, errors.New("division by zero")
	}
	return a / b, nil
}

// Calculator is a struct for calculations
type Calculator struct {
	Value float64
}

// Add is a method on Calculator
func (c *Calculator) Add(n float64) {
	c.Value += n
}

// Multiply is a method on Calculator
func (c *Calculator) Multiply(n float64) {
	c.Value *= n
}

// ProcessNumbers demonstrates control flow
func ProcessNumbers(numbers []int) int {
	sum := 0

	// For loop
	for i := 0; i < len(numbers); i++ {
		// If statement
		if numbers[i] > 0 {
			sum += numbers[i]
		} else if numbers[i] < 0 {
			sum -= numbers[i]
		} else {
			continue
		}
	}

	// Range loop
	for _, num := range numbers {
		if num > 100 {
			break
		}
	}

	return sum
}

// GetGrade demonstrates switch statement
func GetGrade(score int) string {
	switch {
	case score >= 90:
		return "A"
	case score >= 80:
		return "B"
	case score >= 70:
		return "C"
	case score >= 60:
		return "D"
	default:
		return "F"
	}
}

// TypeSwitch demonstrates type switch
func TypeSwitch(i interface{}) string {
	switch v := i.(type) {
	case int:
		return fmt.Sprintf("int: %d", v)
	case string:
		return fmt.Sprintf("string: %s", v)
	case bool:
		return fmt.Sprintf("bool: %t", v)
	default:
		return "unknown"
	}
}

// RecursiveFactorial calculates factorial recursively
func RecursiveFactorial(n int) int {
	if n <= 1 {
		return 1
	}
	return n * RecursiveFactorial(n-1)
}

func main() {
	SimpleFunction()
	result := Add(5, 3)
	fmt.Println(result)

	calc := &Calculator{Value: 10}
	calc.Add(5)
	calc.Multiply(2)

	numbers := []int{1, 2, 3, -4, 5}
	sum := ProcessNumbers(numbers)
	fmt.Println(sum)

	grade := GetGrade(85)
	fmt.Println(grade)
}
