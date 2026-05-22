from __future__ import annotations

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity as _sk_cosine

_model = SentenceTransformer("all-MiniLM-L6-v2")


def compute_similarity(text1: str, text2: str) -> float:
    embeddings = _model.encode([text1, text2])
    score = _sk_cosine([embeddings[0]], [embeddings[1]])[0][0]
    return float(score)


def similarity_tool(text1: str, text2: str) -> float:
    return compute_similarity(text1, text2)


# Export for direct use in other modules
def get_model():
    return _model


def cosine_similarity_vectors(v1, v2) -> float:
    """Compute cosine similarity between two vectors."""
    return float(_sk_cosine([v1], [v2])[0][0])

