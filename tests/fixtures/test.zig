/// Zig test fixture for codebuddy parser testing.
/// Tests various function declaration styles and control flow.

const std = @import("std");

// Simple function
pub fn greet(name: []const u8) []const u8 {
    _ = name;
    return "Hello!";
}

// Function with multiple parameters
pub fn add(a: i32, b: i32) i32 {
    return a + b;
}

// Function with control flow
pub fn factorial(n: u64) u64 {
    if (n <= 1) {
        return 1;
    } else {
        return n * factorial(n - 1);
    }
}

// Function with while loop
pub fn sumToN(n: i32) i32 {
    var sum: i32 = 0;
    var i: i32 = 1;
    while (i <= n) : (i += 1) {
        sum += i;
    }
    return sum;
}

// Function with for loop
pub fn sumArray(numbers: []const i32) i32 {
    var sum: i32 = 0;
    for (numbers) |num| {
        sum += num;
    }
    return sum;
}

// Function with switch expression
pub fn describeNumber(n: i32) []const u8 {
    return switch (n) {
        0 => "zero",
        1...9 => "single digit",
        10...99 => "double digit",
        else => "large number",
    };
}

// Function with optional handling
pub fn safeDivide(a: i32, b: i32) ?i32 {
    if (b == 0) {
        return null;
    }
    return @divTrunc(a, b);
}

// Function with error handling
pub fn readNumber(input: []const u8) !i32 {
    return std.fmt.parseInt(i32, input, 10) catch |err| {
        return err;
    };
}

// Struct with methods
const Calculator = struct {
    value: i32,

    pub fn init(initial: i32) Calculator {
        return Calculator{ .value = initial };
    }

    pub fn addValue(self: *Calculator, n: i32) *Calculator {
        self.value += n;
        return self;
    }

    pub fn result(self: Calculator) i32 {
        return self.value;
    }
};

// Generic function
pub fn max(comptime T: type, a: T, b: T) T {
    if (a > b) {
        return a;
    } else {
        return b;
    }
}

// Function that calls other functions
pub fn calculate(a: i32, b: i32, op: u8) i32 {
    return switch (op) {
        '+' => add(a, b),
        '*' => a * b,
        else => 0,
    };
}

test "add" {
    const result = add(2, 3);
    try std.testing.expectEqual(@as(i32, 5), result);
}

test "factorial" {
    const result = factorial(5);
    try std.testing.expectEqual(@as(u64, 120), result);
}
