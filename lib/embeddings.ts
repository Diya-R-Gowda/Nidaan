export type Embedding = number[];

export async function createEmbedding(_narrative: string): Promise<Embedding> {
  throw new Error("Embedding generation is not configured yet");
}
