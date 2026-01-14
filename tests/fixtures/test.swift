/// Swift test fixture for codebuddy parser testing.
/// Tests various function declaration styles and control flow.

import Foundation

// Simple function
func greet(name: String) -> String {
    return "Hello, \(name)!"
}

// Function with multiple parameters
func add(a: Int, b: Int) -> Int {
    return a + b
}

// Function with control flow
func factorial(n: Int) -> Int {
    if n <= 1 {
        return 1
    } else {
        return n * factorial(n: n - 1)
    }
}

// Function with guard statement
func divide(a: Int, b: Int) -> Int? {
    guard b != 0 else {
        return nil
    }
    return a / b
}

// Function with for-in loop
func sumToN(n: Int) -> Int {
    var sum = 0
    for i in 1...n {
        sum += i
    }
    return sum
}

// Function with while loop
func countDigits(number: Int) -> Int {
    var n = abs(number)
    var count = 0
    while n > 0 {
        count += 1
        n /= 10
    }
    return count == 0 ? 1 : count
}

// Function with repeat-while loop
func findFirstPositive(numbers: [Int]) -> Int? {
    var i = 0
    repeat {
        if numbers[i] > 0 {
            return numbers[i]
        }
        i += 1
    } while i < numbers.count
    return nil
}

// Function with switch statement
func describeNumber(n: Int) -> String {
    switch n {
    case 0:
        return "zero"
    case 1...9:
        return "single digit"
    case 10...99:
        return "double digit"
    default:
        return "large number"
    }
}

// Class with methods
class Calculator {
    var value: Int

    init(initialValue: Int = 0) {
        self.value = initialValue
    }

    func add(n: Int) -> Calculator {
        self.value += n
        return self
    }

    func subtract(n: Int) -> Calculator {
        self.value -= n
        return self
    }

    func result() -> Int {
        return self.value
    }

    static func create(value: Int) -> Calculator {
        return Calculator(initialValue: value)
    }
}

// Function with do-catch (try-catch)
func readFile(path: String) throws -> String {
    do {
        let contents = try String(contentsOfFile: path)
        return contents
    } catch {
        throw error
    }
}

// Generic function
func maximum<T: Comparable>(a: T, b: T) -> T {
    if a > b {
        return a
    } else {
        return b
    }
}

// Function that calls other functions
func calculate(a: Int, b: Int, operation: String) -> Int {
    switch operation {
    case "add":
        return add(a: a, b: b)
    case "factorial":
        return factorial(n: a)
    case "sum":
        return sumToN(n: a)
    default:
        return 0
    }
}
