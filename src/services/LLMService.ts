import { z, type ZodTypeAny } from "zod";
import type { LLMProviderPort } from "./llm/LLMProvider.js";
import { OllamaProvider } from "./llm/OllamaProvider.js";
import { OpenAICompatibleProvider } from "./llm/OpenAICompatibleProvider.js";

export interface LLMServiceConfig {
  model: string;
  provider: LLMProviderPort;
}

export interface LLMServicePort {
  isConfigured(): boolean;
  promptForStructuredJson<TSchema extends ZodTypeAny>(
    prompt: string,
    schema: TSchema,
  ): Promise<z.infer<TSchema>>;
}

export class LLMServiceNotConfiguredError extends Error {
  constructor() {
    super(
      "LLMService has no provider configured. Call llmService.configure() before use.",
    );
    this.name = "LLMServiceNotConfiguredError";
  }
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

type ResolvedConfig = {
  model: string;
  systemPrompt: string;
  provider: LLMProviderPort;
};

export class LLMService implements LLMServicePort {
  private currentConfig: ResolvedConfig | null = null;

  configure(config: LLMServiceConfig): void {
    this.currentConfig = {
      model: config.model,
      systemPrompt: SYSTEM_PROMPT,
      provider: config.provider,
    };
  }

  isConfigured(): boolean {
    return this.currentConfig !== null;
  }

  private requireConfig(): ResolvedConfig {
    if (!this.currentConfig) {
      throw new LLMServiceNotConfiguredError();
    }

    return this.currentConfig;
  }

  async promptForStructuredJson<TSchema extends ZodTypeAny>(
    prompt: string,
    schema: TSchema,
  ): Promise<z.infer<TSchema>> {
    const config = this.requireConfig();

    const messageContent = [
      prompt,
      "Return a single JSON object response.",
    ].join("\n\n");

    const content = await config.provider.generate({
      model: config.model,
      systemPrompt: config.systemPrompt,
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

/** Singleton LLMService instance. Call `llmService.configure()` before use. */
export const llmService = new LLMService();

export interface OllamaLLMServiceConfig {
  model: string;
  baseUrl: string;
}

export const createOllamaLLMService = (
  config: OllamaLLMServiceConfig,
): LLMService => {
  const service = new LLMService();
  service.configure({
    model: config.model,
    provider: new OllamaProvider({ baseUrl: config.baseUrl }),
  });
  return service;
};

export interface OpenAICompatibleLLMServiceConfig {
  model: string;
  apiKey: string;
}

export const createOpenAICompatibleLLMService = (
  config: OpenAICompatibleLLMServiceConfig,
): LLMService => {
  const service = new LLMService();
  service.configure({
    model: config.model,
    provider: new OpenAICompatibleProvider({ apiKey: config.apiKey }),
  });
  return service;
};
