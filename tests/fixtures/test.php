<?php
/**
 * PHP test fixture for codebuddy parser testing.
 * Tests various function declaration styles and control flow.
 */

// Simple function
function greet(string $name): string {
    return "Hello, {$name}!";
}

// Function with multiple parameters
function add(int $a, int $b): int {
    return $a + $b;
}

// Function with control flow
function factorial(int $n): int {
    if ($n <= 1) {
        return 1;
    } else {
        return $n * factorial($n - 1);
    }
}

// Function with null check
function safeDivide(int $a, int $b): ?int {
    if ($b === 0) {
        return null;
    }
    return intdiv($a, $b);
}

// Function with for loop
function sumToN(int $n): int {
    $sum = 0;
    for ($i = 1; $i <= $n; $i++) {
        $sum += $i;
    }
    return $sum;
}

// Function with while loop
function countDigits(int $number): int {
    $n = abs($number);
    $count = 0;
    while ($n > 0) {
        $count++;
        $n = intdiv($n, 10);
    }
    return $count === 0 ? 1 : $count;
}

// Function with do-while loop
function findFirstPositive(array $numbers): ?int {
    $i = 0;
    do {
        if ($numbers[$i] > 0) {
            return $numbers[$i];
        }
        $i++;
    } while ($i < count($numbers));
    return null;
}

// Function with foreach loop
function sumArray(array $numbers): int {
    $sum = 0;
    foreach ($numbers as $num) {
        $sum += $num;
    }
    return $sum;
}

// Function with switch statement
function describeNumber(int $n): string {
    switch (true) {
        case $n === 0:
            return "zero";
        case $n >= 1 && $n <= 9:
            return "single digit";
        case $n >= 10 && $n <= 99:
            return "double digit";
        default:
            return "large number";
    }
}

// Function with try-catch
function readFile(string $path): ?string {
    try {
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new Exception("Could not read file");
        }
        return $contents;
    } catch (Exception $e) {
        echo "Error: " . $e->getMessage();
        return null;
    } finally {
        echo "Attempted to read {$path}";
    }
}

// Class with methods
class Calculator {
    private int $value;

    public function __construct(int $initialValue = 0) {
        $this->value = $initialValue;
    }

    public function add(int $n): self {
        $this->value += $n;
        return $this;
    }

    public function subtract(int $n): self {
        $this->value -= $n;
        return $this;
    }

    public function result(): int {
        return $this->value;
    }

    public static function create(int $value): self {
        return new self($value);
    }
}

// Function that calls other functions
function calculate(int $a, int $b, string $operation): int {
    switch ($operation) {
        case "add":
            return add($a, $b);
        case "factorial":
            return factorial($a);
        case "sum":
            return sumToN($a);
        default:
            return 0;
    }
}

// Arrow function (PHP 7.4+)
$multiply = fn(int $a, int $b): int => $a * $b;

// Anonymous function
$divide = function(int $a, int $b): ?float {
    if ($b === 0) {
        return null;
    }
    return $a / $b;
};
