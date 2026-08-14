export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export const notFound = (entity: string) => new AppError(404, "NOT_FOUND", `${entity} não encontrado.`);
