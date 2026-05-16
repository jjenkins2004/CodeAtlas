import { Router, Request, Response, NextFunction } from "express";
import {
  configureOllamaProviderSchema,
  configureOpenAIProviderSchema,
} from "../validation.js";
import { llmService } from "../../services/LLMService.js";
import { embeddingService } from "../../services/EmbeddingService.js";
import { OllamaProvider } from "../../services/llm/OllamaProvider.js";
import { OpenAICompatibleProvider } from "../../services/llm/OpenAICompatibleProvider.js";

const router = Router();

async function configureOllamaProvider(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const input = configureOllamaProviderSchema.parse(req.body);
    const provider = new OllamaProvider({ baseUrl: input.baseUrl });
    llmService.configure({ model: input.model, provider });
    embeddingService.configure({
      model: input.model,
      embeddingModel: input.embeddingModel,
      provider,
    });

    res.status(200).json({
      message: "Provider configured",
      provider: "ollama",
      model: input.model,
      embeddingModel: input.embeddingModel ?? input.model,
    });
  } catch (err) {
    next(err);
  }
}

async function configureOpenAIProvider(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const input = configureOpenAIProviderSchema.parse(req.body);
    const provider = new OpenAICompatibleProvider({ apiKey: input.apiKey });
    llmService.configure({ model: input.model, provider });
    embeddingService.configure({
      model: input.model,
      embeddingModel: input.embeddingModel,
      provider,
    });

    res.status(200).json({
      message: "Provider configured",
      provider: "openai",
      model: input.model,
      embeddingModel: input.embeddingModel ?? input.model,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /providers/ollama
 * Configure Ollama as the LLM + embedding provider at runtime.
 */
router.post("/ollama", configureOllamaProvider);

/**
 * POST /providers/openai
 * Configure OpenAI-compatible as the LLM + embedding provider at runtime.
 */
router.post("/openai", configureOpenAIProvider);

export default router;
