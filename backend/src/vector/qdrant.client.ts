import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config';

export const qdrantClient = new QdrantClient({
  url: config.QDRANT_URL,
  apiKey: config.QDRANT_API_KEY,
});
