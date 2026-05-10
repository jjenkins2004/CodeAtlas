interface DatabaseErrorShape {
  code?: string;
  cause?: unknown;
}

function hasDatabaseErrorShape(value: unknown): value is DatabaseErrorShape {
  return typeof value === "object" && value !== null;
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!hasDatabaseErrorShape(error)) {
    return false;
  }

  if (error.code === "23505") {
    return true;
  }

  return isUniqueConstraintError(error.cause);
}
