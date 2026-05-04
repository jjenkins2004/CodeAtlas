import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export interface ApiError {
  error: string;
  details?: unknown;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation error", details: err.issues });
    return;
  }

  if (err instanceof Error) {
    const status = (err as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500;
    res.status(status).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}
