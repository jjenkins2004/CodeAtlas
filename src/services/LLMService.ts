import { z, type ZodTypeAny } from "zod";
import type { LLMProviderPort } from "./llm/LLMProvider.js";
import {
  OllamaProvider,
  type OllamaProviderConfig,
} from "./llm/OllamaProvider.js";
import {
  OpenAICompatibleProvider,
  type OpenAICompatibleProviderConfig,
} from "./llm/OpenAICompatibleProvider.js";

export interface LLMServiceConfig {
  model: string;
  provider: LLMProviderPort;
}

export interface LLMServicePort {
  promptForStructuredJson<TSchema extends ZodTypeAny>(
    prompt: string,
    schema: TSchema,
  ): Promise<z.infer<TSchema>>;
}

export class LLMServiceResponseFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMServiceResponseFormatError";
  }
}

export class LLMServiceValidationError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(issues: z.ZodIssue[]) {
    super("LLM response did not match expected schema");
    this.name = "LLMServiceValidationError";
    this.issues = issues;
  }
}

const SYSTEM_PROMPT = [
  "You are an AI agent for CodeAtlas.",
  "CodeAtlas indexes public code symbols into a semantic database so agents can find the right interfaces quickly with low token usage.",
  "Reply as a strict structured JSON API.",
  "Return only valid JSON.",
  "Do not include markdown, code fences, or explanations.",
].join(" ");

const INTERNAL_TEMPERATURE = 0.1;

export class LLMService implements LLMServicePort {
  private readonly config: {
    model: string;
    systemPrompt: string;
    provider: LLMProviderPort;
  };

  constructor(config: LLMServiceConfig) {
    this.config = {
      model: config.model,
      systemPrompt: SYSTEM_PROMPT,
      provider: config.provider,
    };
  }

  async promptForStructuredJson<TSchema extends ZodTypeAny>(
    prompt: string,
    schema: TSchema,
  ): Promise<z.infer<TSchema>> {
    const model = this.config.model;
    const messageContent = [
      prompt,
      "Return a single JSON object response.",
    ].join("\n\n");

    const content = await this.config.provider.generate({
      model,
      systemPrompt: this.config.systemPrompt,
      userPrompt: messageContent,
      temperature: INTERNAL_TEMPERATURE,
    });

    const parsed = this.parseJson(content);
    const validated = schema.safeParse(parsed);

    if (!validated.success) {
      throw new LLMServiceValidationError(validated.error.issues);
    }

    return validated.data;
  }

  private parseJson(content: string): unknown {
    try {
      return JSON.parse(content.trim());
    } catch {
      throw new LLMServiceResponseFormatError(
        "LLM response was not valid JSON",
      );
    }
  }
}

export const createLLMService = (config: LLMServiceConfig): LLMService =>
  new LLMService(config);

export interface OllamaLLMServiceConfig {
  model: string;
  baseUrl: string;
}

export const createOllamaLLMService = (
  config: OllamaLLMServiceConfig,
): LLMService =>
  new LLMService({
    model: config.model,
    provider: new OllamaProvider({ baseUrl: config.baseUrl }),
  });

export interface OpenAICompatibleLLMServiceConfig {
  model: string;
  apiKey: string;
}

export const createOpenAICompatibleLLMService = (
  config: OpenAICompatibleLLMServiceConfig,
): LLMService =>
  new LLMService({
    model: config.model,
    provider: new OpenAICompatibleProvider({
      apiKey: config.apiKey,
    }),
  });
