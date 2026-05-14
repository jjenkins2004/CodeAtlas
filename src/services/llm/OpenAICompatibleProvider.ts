import type { LLMProviderPort, LLMProviderRequest } from "./LLMProvider.js";
import OpenAI from "openai";

export interface OpenAICompatibleProviderConfig {
  apiKey: string;
}

export class OpenAICompatibleProvider implements LLMProviderPort {
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
}
