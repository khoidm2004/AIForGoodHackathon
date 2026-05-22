# Task: Integrate an Output Agent to Present the Final Answer and Simplified Context

## IMPORTANT

- Do NOT modify any existing features or components
- Read and understand the existing codebase first before making any changes
- If something is unclear, ask before implementing

## Background

The pipeline currently runs a simplification step followed by a review agent. This task adds a final **Output Agent** that activates when the simplified text passes the review agent. It is responsible for:

1. Presenting the answer to the user based on their original input
2. Displaying the final simplified context after the simplification step

## Success Criteria

- The output agent runs without errors after the review agent approves the simplified text
- The agent correctly receives and displays the user's original input alongside the final simplified context
- The response structure matches what the rest of the pipeline expects (same shape as before)
- No regressions in existing features — other agents/components behave as before

## How to Test

1. Trigger the full pipeline with a sample user input
2. Confirm the review agent approves the simplified text and passes control to the output agent
3. Verify the output agent displays both the user's answer and the final simplified context correctly
4. Run any existing tests — none should break

## Notes for Agents

- **Planner:** Read the existing codebase and analyze the task above before starting. Map out where the output agent fits in the pipeline and confirm the plan before Coder starts.
- **Coder:** Only add the new output agent and wire it into the post-review step — do not touch other functions or files.
- **Reviewer:** Log what was changed, verify the success criteria above are met, and perform a code review.