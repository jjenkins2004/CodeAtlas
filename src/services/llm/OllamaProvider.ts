import { Ollama, type Message } from "ollama";
import type {
  EmbeddingProviderPort,
  LLMProviderPort,
  LLMProviderRequest,
} from "./LLMProvider.js";

export interface OllamaProviderConfig {
  baseUrl: string;
}

export class OllamaProvider implements LLMProviderPort, EmbeddingProviderPort {
  private readonly ollamaClient: Ollama;

  constructor(config: OllamaProviderConfig) {
    this.ollamaClient = new Ollama({ host: config.baseUrl });
  }

  async generate(request: LLMProviderRequest): Promise<string> {
    const messages: Message[] = [
      {
        role: "system",
        content: request.systemPrompt,
      },
      {
        role: "user",
        content: request.userPrompt,
      },
    ];

    const response = await this.ollamaClient.chat({
      model: request.model,
      messages,
      stream: false,
      format: "json",
      options: {
        temperature: request.temperature,
      },
    });

    const content = response.message?.content;

    if (!content) {
      throw new Error("Ollama response did not include message content");
    }

    return content;
  }

  async embed(text: string, model: string): Promise<number[]> {
    const response = await this.ollamaClient.embed({ model, input: text });
    const embedding = response.embeddings[0];

    if (!embedding) {
      throw new Error("Ollama embed response did not include embeddings");
    }

    return embedding;
  }
}
