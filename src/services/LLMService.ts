import { z, type ZodTypeAny } from "zod";
import {
  Ollama,
  type ChatRequest,
  type ChatResponse,
  type Message,
} from "ollama";

interface OllamaClientLike {
  chat(request: ChatRequest & { stream: false }): Promise<ChatResponse>;
}

export interface LLMServiceConfig {
  model: string;
  baseUrl: string;
}

interface LLMServiceDeps {
  createOllamaClient?: (baseUrl: string) => OllamaClientLike;
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
  };
  private readonly ollamaClient: OllamaClientLike;

  constructor(config: LLMServiceConfig, deps: LLMServiceDeps = {}) {
    const baseUrl = config.baseUrl;
    const createOllamaClient =
      deps.createOllamaClient ?? ((host) => new Ollama({ host }));

    this.config = {
      model: config.model,
      systemPrompt: SYSTEM_PROMPT,
    };

    this.ollamaClient = createOllamaClient(baseUrl);
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

    const messages: Message[] = [
      {
        role: "system",
        content: this.config.systemPrompt,
      },
      {
        role: "user",
        content: messageContent,
      },
    ];

    const response = await this.ollamaClient.chat({
      model,
      messages,
      stream: false,
      format: "json",
      options: {
        temperature: INTERNAL_TEMPERATURE,
      },
    });

    const content = response.message?.content;

    if (!content) {
      throw new LLMServiceResponseFormatError(
        "Ollama response did not include message content",
      );
    }

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
