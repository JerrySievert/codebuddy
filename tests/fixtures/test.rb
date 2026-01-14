# Ruby test fixture for codebuddy parser testing.
# Tests various method declaration styles and control flow.

# Simple method
def greet(name)
  "Hello, #{name}!"
end

# Method with multiple parameters
def add(a, b)
  a + b
end

# Method with control flow
def factorial(n)
  if n <= 1
    1
  else
    n * factorial(n - 1)
  end
end

# Method with unless
def safe_divide(a, b)
  return nil unless b != 0
  a / b
end

# Method with for loop
def sum_to_n(n)
  sum = 0
  for i in 1..n
    sum += i
  end
  sum
end

# Method with while loop
def count_digits(number)
  n = number.abs
  count = 0
  while n > 0
    count += 1
    n /= 10
  end
  count == 0 ? 1 : count
end

# Method with until loop
def find_first_positive(numbers)
  i = 0
  until i >= numbers.length || numbers[i] > 0
    i += 1
  end
  i < numbers.length ? numbers[i] : nil
end

# Method with case/when
def describe_number(n)
  case n
  when 0
    "zero"
  when 1..9
    "single digit"
  when 10..99
    "double digit"
  else
    "large number"
  end
end

# Method with begin/rescue/ensure
def read_file(path)
  begin
    File.read(path)
  rescue Errno::ENOENT => e
    puts "File not found: #{e.message}"
    nil
  ensure
    puts "Attempted to read #{path}"
  end
end

# Class with methods
class Calculator
  attr_reader :value

  def initialize(initial_value = 0)
    @value = initial_value
  end

  def add(n)
    @value += n
    self
  end

  def subtract(n)
    @value -= n
    self
  end

  def result
    @value
  end

  # Class method
  def self.create(value)
    new(value)
  end
end

# Singleton method
def Calculator.version
  "1.0.0"
end

# Method with block
def each_squared(numbers)
  numbers.each do |n|
    yield n * n if block_given?
  end
end

# Method that calls other methods
def calculate(a, b, operation)
  case operation
  when "add"
    add(a, b)
  when "factorial"
    factorial(a)
  when "sum"
    sum_to_n(a)
  else
    0
  end
end

# Method with modifier if
def positive?(n)
  return true if n > 0
  false
end

# Method with modifier unless
def non_zero?(n)
  return false unless n != 0
  true
end
