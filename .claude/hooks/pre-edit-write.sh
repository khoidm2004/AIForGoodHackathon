#!/bin/bash
# PreToolUse hook for Edit/Write - Check git tracking

FILE="${CLAUDE_FILE}"
TOOL="${CLAUDE_TOOL}"

if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" ]]; then
  if git ls-files --error-unmatch "$FILE" > /dev/null 2>&1; then
    echo "📝 Modifying tracked file: $FILE"
  fi
fi
