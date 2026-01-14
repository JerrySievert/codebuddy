/**
 * C test fixture for struct parsing.
 * Tests various struct declaration styles.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Simple struct
struct Point {
  int x;
  int y;
};

// Struct with typedef
typedef struct {
  float x;
  float y;
  float z;
} Vector3D;

// Named struct with typedef
typedef struct Rectangle {
  int width;
  int height;
} Rectangle;

// Struct with nested struct
struct Person {
  char name[ 50 ];
  int age;
  struct {
    char street[ 100 ];
    char city[ 50 ];
    int zip;
  } address;
};

// Struct with function pointers
typedef struct {
  int (*add)(int, int);
  int (*subtract)(int, int);
  int (*multiply)(int, int);
} Calculator;

// Struct for linked list node
struct Node {
  int data;
  struct Node *next;
};

// Struct with union
struct Variant {
  int type;
  union {
    int int_value;
    float float_value;
    char string_value[ 32 ];
  } value;
};

// Forward declaration
struct ForwardDeclared;

// Struct with pointer to itself
struct TreeNode {
  int value;
  struct TreeNode *left;
  struct TreeNode *right;
};

// Functions using structs
struct Point create_point(int x, int y) {
  struct Point p;
  p.x = x;
  p.y = y;
  return p;
}

void print_point(struct Point *p) { printf("Point(%d, %d)\n", p->x, p->y); }

Rectangle create_rectangle(int width, int height) {
  Rectangle r;
  r.width  = width;
  r.height = height;
  return r;
}

int rectangle_area(Rectangle *r) { return r->width * r->height; }

int add_impl(int a, int b) { return a + b; }

int subtract_impl(int a, int b) { return a - b; }

int multiply_impl(int a, int b) { return a * b; }

Calculator create_calculator( ) {
  Calculator calc;
  calc.add      = add_impl;
  calc.subtract = subtract_impl;
  calc.multiply = multiply_impl;
  return calc;
}

int main( ) {
  struct Point p = create_point(10, 20);
  print_point(&p);

  Rectangle r = create_rectangle(5, 10);
  printf("Area: %d\n", rectangle_area(&r));

  Calculator calc = create_calculator( );
  printf("Add: %d\n", calc.add(5, 3));

  return 0;
}
