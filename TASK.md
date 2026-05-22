# Task: Integrate Preprocess Agent with `llama-4-scout-17b-16e-instruct` Model from Groq

## IMPORTANT

- Do NOT modify any existing features or components
- Read and understand the existing codebase first before making any changes
- If something is unclear, ask before implementing

## Success Criteria

- The preprocess agent runs without errors using the `llama-4-scout-17b-16e-instruct` model via Groq
- The agent returns a valid, non-empty response for a sample input
- Response structure matches what the rest of the pipeline expects (same shape as before)
- No regressions in existing features — other agents/components behave as before

### How to Test

1. Trigger the preprocess agent manually with a sample input
2. Log or print the raw response from Groq and confirm the model name in the response metadata matches `llama-4-scout-17b-16e-instruct`
3. Verify the output structure is correct and passes into the next pipeline step without errors
4. Run any existing tests — none should break

## Notes for Agents

- **Planner:** Read the existing codebase and analyze the task above before starting. Map out the strategy and confirm the plan before Coder starts.
- **Coder:** Only modify the necessary files — do not touch other functions or files.
- **Reviewer:** Log what was changed, verify the success criteria above are met, and perform a code review.