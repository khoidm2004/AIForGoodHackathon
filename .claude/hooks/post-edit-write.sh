#!/bin/bash
# PostToolUse hook for Edit/Write - ESLint, Prettier, CHANGELOG reminder

FILE="${CLAUDE_FILE}"
TOOL="${CLAUDE_TOOL}"

if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" ]]; then
  # Run ESLint --fix for .ts/.tsx files
  if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]]; then
    if command -v eslint &> /dev/null; then
      npx eslint --fix "$FILE" 2>/dev/null || true
    fi
  fi

  # Run Prettier
  if command -v prettier &> /dev/null; then
    npx prettier --write "$FILE" 2>/dev/null || true
  fi

  # Remind Reviewer agent about CHANGELOG_AI.md
  echo "ℹ️  Reviewer: Remember to append an entry to CHANGELOG_AI.md"
fi
