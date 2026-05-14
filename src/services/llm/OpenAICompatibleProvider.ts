import type {
  EmbeddingProviderPort,
  LLMProviderPort,
  LLMProviderRequest,
} from "./LLMProvider.js";
import OpenAI from "openai";

export interface OpenAICompatibleProviderConfig {
  apiKey: string;
}

export class OpenAICompatibleProvider
  implements LLMProviderPort, EmbeddingProviderPort
{
  private readonly client: OpenAI;

  constructor(config: OpenAICompatibleProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  async generate(request: LLMProviderRequest): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      response_format: { type: "json_object" },
      temperature: request.temperature,
      messages: [
        {
          role: "system",
          content: request.systemPrompt,
        },
        {
          role: "user",
          content: request.userPrompt,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "OpenAI-compatible response did not include message content",
      );
    }

    return content;
  }

  async embed(text: string, model: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model,
      input: text,
    });

    const embedding = response.data[0]?.embedding;

    if (!embedding) {
      throw new Error(
        "OpenAI-compatible embed response did not include embeddings",
      );
    }

    return embedding;
  }
}
