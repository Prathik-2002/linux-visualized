#!/bin/sh
# Concatenates src/ parts into the single self-contained linux-visualized.html
cd "$(dirname "$0")" && cat src/00-head.html src/*.js src/99-tail.html > linux-visualized.html && echo "built linux-visualized.html ($(wc -c < linux-visualized.html) bytes)"
