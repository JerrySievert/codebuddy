#include <stdio.h>
#include <stdlib.h>

// Function returning a pointer
char* get_string(void) {
  return "hello";
}

// Function returning unsigned int
unsigned int get_count(void) {
  return 42;
}

// Function returning const pointer
const char* get_const_string(void) {
  return "const hello";
}

// Function returning long long
long long get_big_number(void) {
  return 123456789LL;
}

// Function returning struct pointer
struct node* get_node(void) {
  return NULL;
}

// Simple void function
void do_nothing(void) {
}

// Function returning size_t (typedef)
size_t get_size(void) {
  return sizeof(int);
}

int main(void) {
  get_string();
  get_count();
  get_const_string();
  get_big_number();
  get_node();
  do_nothing();
  get_size();
  return 0;
}
