export interface LLMProviderRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}

export interface LLMProviderPort {
  generate(request: LLMProviderRequest): Promise<string>;
}
