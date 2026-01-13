"""
Python test fixture for codebuddy parser testing.
Tests various function and class definition styles.
"""

from typing import List, Optional, Union
import asyncio


# Simple function
def greet(name: str) -> str:
    """Return a greeting message."""
    return f"Hello, {name}!"


# Function with multiple parameters
def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b


# Function with default parameter
def multiply(x: float, y: float = 1.0) -> float:
    """Multiply two numbers."""
    return x * y


# Function with *args and **kwargs
def flexible_sum(*args, **kwargs) -> float:
    """Sum all positional arguments."""
    total = sum(args)
    if 'multiplier' in kwargs:
        total *= kwargs['multiplier']
    return total


# Async function
async def fetch_data(url: str) -> dict:
    """Simulate fetching data from a URL."""
    await asyncio.sleep(0.1)
    return {"url": url, "data": "sample"}


# Generator function
def fibonacci(n: int):
    """Generate Fibonacci sequence up to n."""
    a, b = 0, 1
    while a < n:
        yield a
        a, b = b, a + b


# Decorator
def log_calls(func):
    """Decorator to log function calls."""
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        result = func(*args, **kwargs)
        print(f"{func.__name__} returned {result}")
        return result
    return wrapper


@log_calls
def decorated_add(a: int, b: int) -> int:
    """A decorated function."""
    return a + b


# Class definition
class Calculator:
    """A simple calculator class."""

    def __init__(self, initial_value: float = 0):
        """Initialize the calculator."""
        self.value = initial_value

    def add(self, n: float) -> 'Calculator':
        """Add a number to the current value."""
        self.value += n
        return self

    def subtract(self, n: float) -> 'Calculator':
        """Subtract a number from the current value."""
        self.value -= n
        return self

    def multiply(self, n: float) -> 'Calculator':
        """Multiply the current value by a number."""
        self.value *= n
        return self

    def divide(self, n: float) -> 'Calculator':
        """Divide the current value by a number."""
        if n == 0:
            raise ValueError("Cannot divide by zero")
        self.value /= n
        return self

    @property
    def result(self) -> float:
        """Get the current result."""
        return self.value

    @staticmethod
    def create(value: float) -> 'Calculator':
        """Create a new Calculator with an initial value."""
        return Calculator(value)

    @classmethod
    def from_string(cls, value_str: str) -> 'Calculator':
        """Create a Calculator from a string value."""
        return cls(float(value_str))


# Nested function
def outer_function(x: int) -> int:
    """Outer function containing a nested function."""

    def inner_function(y: int) -> int:
        """Inner nested function."""
        return y * 2

    return inner_function(x) + x


# Lambda stored in variable (won't be captured as named function)
square = lambda x: x * x


# Function that calls other functions
def calculate(a: float, b: float, operation: str) -> Union[float, str]:
    """Perform a calculation based on the operation."""
    if operation == 'add':
        return add(int(a), int(b))
    elif operation == 'multiply':
        return multiply(a, b)
    elif operation == 'greet':
        return greet(str(a))
    else:
        return "Unknown operation"


# Main function
def main():
    """Main entry point."""
    calc = Calculator(10)
    result = calc.add(5).multiply(2).result
    print(f"Result: {result}")

    print(greet("World"))
    print(add(3, 4))
    print(calculate(10, 20, 'add'))


if __name__ == "__main__":
    main()
