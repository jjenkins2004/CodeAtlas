import type { DrizzleConfig } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * Base class for all database services.
 *
 * Provides shared infrastructure for:
 * - Safe query execution with comprehensive error handling
 * - Structured logging for all database operations
 * - Connection lifecycle management via the shared drizzle client
 */
export abstract class BaseDBService {
  protected db: PgDatabase<any>;

  constructor(db: PgDatabase<any>) {
    this.db = db;
  }

  /**
   * Wraps a database query in a safe execution context.
   *
   * Provides:
   * - Try-catch error handling
   * - Structured logging (operation name, duration, success/failure)
   * - Type-safe return value
   *
   * @param operationName - Human-readable name for logs (e.g., "findRepositoryById")
   * @param fn - Async function that executes the query
   * @returns The result from `fn`, or throws on error with context
   */
  protected async executeQuery<T>(
    operationName: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();

    try {
      this.logDebug(operationName, "started");
      const result = await fn();
      const duration = Date.now() - startTime;
      this.logDebug(operationName, `completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logError(
        operationName,
        `failed after ${duration}ms: ${this.getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Wraps a mutation (insert/update/delete) with logging.
   * Same as executeQuery but semantically for writes.
   */
  protected async executeMutation<T>(
    operationName: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.executeQuery(operationName, fn);
  }

  /**
   * Extracts a human-readable error message from various error types.
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error";
  }

  /**
   * Log a debug-level message.
   */
  protected logDebug(operation: string, message: string): void {
    console.log(`[DB ${this.constructor.name}] ${operation}: ${message}`);
  }

  /**
   * Log an error-level message.
   */
  protected logError(operation: string, message: string): void {
    console.error(
      `[DB ${this.constructor.name}] ERROR in ${operation}: ${message}`,
    );
  }
}
