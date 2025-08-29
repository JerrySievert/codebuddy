#include <stdio.h>

void my_function(int);

struct {
  int x;
  int y;
} xy;

/**
 * @brief Function to be called.
 *
 * This function prints a greeting message along with the provided argument.
 * @param arg Argument to be passed to the function.
 */
void my_function(int arg) { printf("Hello, World! (%d)\n", arg); }

int main( ) {
  // Call the function with an argument
  my_function(42);

  return 0;
}
