# Code Buddy

## Setup

```
/opt/homebrew/opt/grep/libexec/gnubin/grep -nHoP '(\w+)\s*\(' ~/work/pljs/src/pljs.c | grep -v "if (" | grep -v "for (" | sed 's/(//' >pljs_c_calls.out
ctags --c-kinds=f  --output-format=json --fields=\* src/*.c >/tmp/tags.json
```
