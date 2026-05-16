import type { EmbeddingProviderPort } from "./llm/LLMProvider.js";
import { OllamaProvider } from "./llm/OllamaProvider.js";
import { OpenAICompatibleProvider } from "./llm/OpenAICompatibleProvider.js";
import { createLogger } from "./util/Logger.js";

const logger = createLogger({ component: "embedding-service" });

export interface EmbeddingServiceConfig {
  model: string;
  /** Model used for generating embeddings. Defaults to `model` if not provided. */
  embeddingModel?: string;
  provider: EmbeddingProviderPort;
}

export interface EmbeddingServicePort {
  isConfigured(): boolean;
  embed(text: string): Promise<number[]>;
}

export class EmbeddingServiceNotConfiguredError extends Error {
  constructor() {
    super(
      "EmbeddingService has no provider configured. Call embeddingService.configure() before use.",
    );
    this.name = "EmbeddingServiceNotConfiguredError";
  }
}

type ResolvedConfig = {
  model: string;
  embeddingModel: string;
  provider: EmbeddingProviderPort;
};

export class EmbeddingService implements EmbeddingServicePort {
  private currentConfig: ResolvedConfig | null = null;

  configure(config: EmbeddingServiceConfig): void {
    this.currentConfig = {
      model: config.model,
      embeddingModel: config.embeddingModel ?? config.model,
      provider: config.provider,
    };
  }

  isConfigured(): boolean {
    return this.currentConfig !== null;
  }

  private requireConfig(): ResolvedConfig {
    if (!this.currentConfig) {
      throw new EmbeddingServiceNotConfiguredError();
    }

    return this.currentConfig;
  }

  async embed(text: string): Promise<number[]> {
    const config = this.requireConfig();

    const startTime = Date.now();
    logger.debug(
      {
        model: config.embeddingModel,
        inputLength: text.length,
      },
      "Embedding request started",
    );

    const embedding = await config.provider.embed(text, config.embeddingModel);

    logger.debug(
      {
        model: config.embeddingModel,
        inputLength: text.length,
        durationMs: Date.now() - startTime,
        dimensionCount: embedding.length,
      },
      "Embedding request completed",
    );

    return embedding;
  }
}

/** Singleton EmbeddingService instance. Call `embeddingService.configure()` before use. */
export const embeddingService = new EmbeddingService();

export interface OllamaEmbeddingServiceConfig {
  model: string;
  embeddingModel?: string;
  baseUrl: string;
}

export const createOllamaEmbeddingService = (
  config: OllamaEmbeddingServiceConfig,
): EmbeddingService => {
  const service = new EmbeddingService();
  service.configure({
    model: config.model,
    embeddingModel: config.embeddingModel,
    provider: new OllamaProvider({ baseUrl: config.baseUrl }),
  });
  return service;
};

export interface OpenAICompatibleEmbeddingServiceConfig {
  model: string;
  embeddingModel?: string;
  apiKey: string;
}

export const createOpenAICompatibleEmbeddingService = (
  config: OpenAICompatibleEmbeddingServiceConfig,
): EmbeddingService => {
  const service = new EmbeddingService();
  service.configure({
    model: config.model,
    embeddingModel: config.embeddingModel,
    provider: new OpenAICompatibleProvider({ apiKey: config.apiKey }),
  });
  return service;
};
