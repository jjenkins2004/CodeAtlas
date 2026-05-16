import { Router, Request, Response, NextFunction } from "express";
import { meaningSearchSchema } from "../validation.js";
import { SymbolService } from "../../services/SymbolService.js";

const router = Router();

/**
 * GET /search/meaning
 * Search indexed symbols by natural-language intent.
 */
router.get(
  "/meaning",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = meaningSearchSchema.parse(req.query);
      const results = await SymbolService.query(
        params.q,
        params.limit,
        params.repositoryId,
      );
      res.json(results);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
