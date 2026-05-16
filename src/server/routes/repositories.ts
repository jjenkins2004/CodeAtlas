import { Router, Request, Response, NextFunction } from "express";
import {
  createRepositorySchema,
  untrackRepositorySchema,
  reindexPathSchema,
  startTrackingSchema,
} from "../validation.js";
import { RepositoryService } from "../../services/RepositoryService";

const router = Router();

/**
 * POST /repositories
 * Begin tracking a new repository.
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createRepositorySchema.parse(req.body);
    const repository = await RepositoryService.track(input);
    res.status(201).json(repository);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /repositories/start
 * Start tracking an already-registered repository by name.
 */
router.post(
  "/start",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = startTrackingSchema.parse(req.body);
      const repository = await RepositoryService.start(input.name);
      res.status(200).json(repository);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /repositories
 * List all tracked repositories.
 */
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const repositories = await RepositoryService.list();
    res.json(repositories);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /repositories/:id
 * Get a single tracked repository.
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repository = await RepositoryService.get(req.params["id"]!);
    if (!repository) {
      res.status(404).json({ error: "Repository not found" });
      return;
    }
    res.json(repository);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /repositories/:id
 * Stop tracking a repository.
 * Query param: delete=true also removes all indexed symbols.
 */
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { delete: shouldDelete } = untrackRepositorySchema.parse(req.query);
      await RepositoryService.untrack(req.params["id"]!, shouldDelete);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /repositories/:id/reindex
 * Reindex the entire repository (or a sub-path via body.subpath).
 */
router.post(
  "/:id/reindex",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subpath } = reindexPathSchema.parse(req.body);
      await RepositoryService.reindex(req.params["id"]!, subpath);
      res.status(202).json({ message: "Reindex started" });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
