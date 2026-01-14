/// Rust test fixture for codebuddy parser testing.
/// Tests various function declaration styles and control flow.

// Simple function
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

// Function with multiple parameters
fn add(a: i32, b: i32) -> i32 {
    a + b
}

// Function with control flow
fn factorial(n: u64) -> u64 {
    if n <= 1 {
        1
    } else {
        n * factorial(n - 1)
    }
}

// Function with loops
fn sum_to_n(n: i32) -> i32 {
    let mut sum = 0;
    for i in 1..=n {
        sum += i;
    }
    sum
}

// Function with while loop
fn count_digits(mut n: i32) -> i32 {
    let mut count = 0;
    while n > 0 {
        count += 1;
        n /= 10;
    }
    count
}

// Function with match expression
fn describe_number(n: i32) -> &'static str {
    match n {
        0 => "zero",
        1..=9 => "single digit",
        10..=99 => "double digit",
        _ => "large number",
    }
}

// Function with loop expression
fn find_first_even(numbers: &[i32]) -> Option<i32> {
    let mut i = 0;
    loop {
        if i >= numbers.len() {
            break None;
        }
        if numbers[i] % 2 == 0 {
            break Some(numbers[i]);
        }
        i += 1;
    }
}

// Struct with methods
struct Calculator {
    value: i32,
}

impl Calculator {
    // Associated function (constructor)
    fn new(initial: i32) -> Self {
        Calculator { value: initial }
    }

    // Method
    fn add(&mut self, n: i32) -> &mut Self {
        self.value += n;
        self
    }

    // Method with return
    fn result(&self) -> i32 {
        self.value
    }
}

// Generic function
fn max<T: PartialOrd>(a: T, b: T) -> T {
    if a > b {
        a
    } else {
        b
    }
}

// Function that calls other functions
fn calculate(a: i32, b: i32, op: &str) -> i32 {
    match op {
        "add" => add(a, b),
        "factorial" => factorial(a as u64) as i32,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn test_factorial() {
        assert_eq!(factorial(5), 120);
    }
}
