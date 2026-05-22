from __future__ import annotations

from typing import Any

from openai import OpenAI

from config import OPENROUTER_API_KEY, OPENROUTER_MODEL

_client = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
)


def chat(messages: list[dict[str, str]], model: str = OPENROUTER_MODEL, **kwargs: Any) -> str:
    response = _client.chat.completions.create(model=model, messages=messages, **kwargs)
    content = response.choices[0].message.content
    return content if content is not None else ""

