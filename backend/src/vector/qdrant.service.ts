import { qdrantClient } from './qdrant.client';

export async function ensureCollection(name: string, vectorSize: number): Promise<void> {
  const collections = await qdrantClient.getCollections();
  const exists = collections.collections.some((c) => c.name === name);
  if (!exists) {
    await qdrantClient.createCollection(name, { vectors: { size: vectorSize, distance: 'Cosine' } });
  }
}

export async function upsertVector(collection: string, id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
  await qdrantClient.upsert(collection, { points: [{ id, vector, payload }] });
}

export async function searchVectors(collection: string, vector: number[], limit = 5) {
  return qdrantClient.search(collection, { vector, limit });
}
