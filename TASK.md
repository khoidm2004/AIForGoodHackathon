# Task: Integrate Streaming Feature from LLM Response

## IMPORTANT

- Do NOT modify any existing features or components
- Read and understand the existing codebase first before making any changes
- If something is unclear, ask before implementing

## Background

The app has 4 agents. Currently the LLM response is buffered and returned all at once,
causing the client to wait for the full response before rendering anything.
Streaming will allow the client to receive and display chunks as they arrive.

## Success Criteria

- Client receives and renders LLM response chunks in real-time
- Time to first token (TTFT) is visibly reduced
- No existing features or components are broken

## How to Test

- Send a long text input to the `/api/process` endpoint
- Verify the response streams in chunks instead of arriving all at once
- Check the UI updates incrementally as chunks arrive
- Confirm all 4 agents still work as expected

## Notes for Agents

- **Planner:** Read the existing codebase and identify which agent or route handles the LLM call. Map out where streaming needs to be wired in and confirm the plan before Coder starts.
- **Coder:** Only add streaming to the LLM response layer and update the client to consume `text/event-stream` — do not touch other functions or files.
- **Reviewer:** Log what was changed, verify the success criteria above are met, and perform a code review.