"""
Python test fixture for class parsing.
Tests various class definition styles.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


# Simple class
class Animal:
    """A simple animal class."""

    def __init__(self, name: str):
        self.name = name

    def speak(self) -> str:
        return f"{self.name} makes a sound"


# Class with inheritance
class Dog(Animal):
    """A dog class that extends Animal."""

    def __init__(self, name: str, breed: str):
        super().__init__(name)
        self.breed = breed

    def speak(self) -> str:
        return f"{self.name} barks"

    def fetch(self) -> str:
        return f"{self.name} fetches the ball"


# Abstract base class
class Shape(ABC):
    """Abstract base class for shapes."""

    @abstractmethod
    def area(self) -> float:
        pass

    @abstractmethod
    def perimeter(self) -> float:
        pass


# Class implementing abstract class
class Rectangle(Shape):
    """A rectangle implementation of Shape."""

    def __init__(self, width: float, height: float):
        self.width = width
        self.height = height

    def area(self) -> float:
        return self.width * self.height

    def perimeter(self) -> float:
        return 2 * (self.width + self.height)


# Dataclass (struct-like)
@dataclass
class Point:
    """A point in 2D space."""

    x: float
    y: float
    label: Optional[str] = None


# Dataclass with methods
@dataclass
class Vector:
    """A 2D vector."""

    x: float
    y: float

    def magnitude(self) -> float:
        return (self.x**2 + self.y**2) ** 0.5

    def normalize(self) -> "Vector":
        mag = self.magnitude()
        return Vector(self.x / mag, self.y / mag)


# Class with class methods and static methods
class MathUtils:
    """Utility class with static and class methods."""

    PI = 3.14159

    @staticmethod
    def add(a: float, b: float) -> float:
        return a + b

    @classmethod
    def circle_area(cls, radius: float) -> float:
        return cls.PI * radius**2


# Nested class
class Outer:
    """Outer class containing a nested class."""

    class Inner:
        """Nested inner class."""

        def __init__(self, value: int):
            self.value = value

        def get_value(self) -> int:
            return self.value

    def create_inner(self, value: int) -> "Outer.Inner":
        return self.Inner(value)


# Multiple inheritance
class Flyable:
    """Mixin for flying capability."""

    def fly(self) -> str:
        return "Flying!"


class Swimmable:
    """Mixin for swimming capability."""

    def swim(self) -> str:
        return "Swimming!"


class Duck(Animal, Flyable, Swimmable):
    """A duck that can fly and swim."""

    def speak(self) -> str:
        return f"{self.name} quacks"
