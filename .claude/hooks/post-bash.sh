#!/bin/bash
# PostToolUse hook for Bash - Test summary

COMMAND="${CLAUDE_COMMAND}"
TOOL="${CLAUDE_TOOL}"

if [[ "$TOOL" == "Bash" ]]; then
  if [[ "$COMMAND" =~ test|jest|vitest ]]; then
    echo "🧪 Test run completed - check results above"
  fi
fi
