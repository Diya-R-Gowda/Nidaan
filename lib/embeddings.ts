import {
  pipeline,
  type FeatureExtractionPipeline,
} from "@xenova/transformers";

export type Embedding = number[];

const MODEL = "Xenova/all-MiniLM-L6-v2";

let extractorPromise: Promise<FeatureExtractionPipeline> | undefined;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractorPromise ??= pipeline("feature-extraction", MODEL);
  return extractorPromise;
}

export async function embed(text: string): Promise<Embedding> {
  if (text.trim() === "") {
    throw new Error("Cannot generate an embedding for empty text");
  }

  const extractor = await getExtractor();
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,
  });
  const embedding = Array.from(output.data, Number);

  if (embedding.length !== 384) {
    throw new Error(
      `Expected a 384-dimensional embedding, received ${embedding.length}`,
    );
  }

  return embedding;
}
