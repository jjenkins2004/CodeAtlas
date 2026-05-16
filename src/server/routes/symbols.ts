import { Router, Request, Response, NextFunction } from "express";
import {
  listSymbolsSchema,
  querySymbolsSchema,
  upsertSymbolSchema,
} from "../validation.js";
import { SymbolService } from "../../services/SymbolService.js";

const router = Router();

/**
 * GET /symbols
 * List registered symbols, optionally filtered by repository.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = listSymbolsSchema.parse(req.query);
    const symbols = await SymbolService.list(params.repositoryId);
    res.json(symbols.slice(0, params.limit));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /symbols/query
 * Semantic search: returns ranked symbols matching a natural-language query.
 */
router.get(
  "/query",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = querySymbolsSchema.parse(req.query);
      const results = await SymbolService.query(
        params.q,
        params.limit,
        params.repositoryId
      );
      res.json(results);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /symbols
 * Manually upsert a symbol (creates or updates by repository+symbol+file).
 */
router.put("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = upsertSymbolSchema.parse(req.body);
    const symbol = await SymbolService.upsert(input);
    res.json(symbol);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /symbols/:id
 * Retrieve a single symbol by ID.
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const symbol = await SymbolService.get(req.params["id"]!);
    if (!symbol) {
      res.status(404).json({ error: "Symbol not found" });
      return;
    }
    res.json(symbol);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /symbols/:id
 * Delete a single symbol by ID.
 */
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await SymbolService.delete(req.params["id"]!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
