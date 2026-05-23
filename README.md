# AI For Good Hackathon

## Challenge 🎯

Build agentic AI solutions that deliver measurable impact for people, planet, and trust in at least one area.

- **Impact:** Increase access, reduce friction, and improve outcomes for end beneficiaries.
- **Sustainability:** Measure, reduce, or optimize environmental and operational footprint.
- **Trust & Responsible AI:** Build with safety-by-design so the solution can be used responsibly in real settings.

## Project Description 🗒️

This project implements a multi-agent pipeline that preprocesses, simplifies, and reviews user prompts before sending them to an LLM—removing redundant detail and sensitive information where possible (data minimization for **Trust & Responsible AI**).

The app mimics a ChatGPT-style experience with configurable privacy levels (low / medium / high). A simplification agent chain produces a minimized prompt and a final answer for the user.

**Benefit:** Less sensitive data in transit and fewer tokens, while stripping noise from messy prompts so the model can answer more accurately.

## Tech Stack 💻

- **Design:** Figma
- **Frontend:** Vite + React + Tailwind + Shadcn UI
- **Backend:** Node.js + TypeScript + Express + Docker
- **AI/LLM:** LangGraph + Groq + OpenRouter + HuggingFace
- **Deploy:** Vercel + Render

## Team Members 👷

- [Khoi Do](https://github.com/khoidm2004): Lead Developer, Backend Developer, AI Developer
- [Dung Nguyen](https://github.com/pjazzy314159): Algorithms Developer, AI Developer, Backend Developer
- [Nhi Nguyen](https://github.com/nhingnguyen): Designer, Frontend Developer
- [Khoa Nguyen](https://github.com/Hkhoa25): Designer, Frontend Developer

## Project Architecture 🖥️

![Project architecture diagram](public/image.png)
