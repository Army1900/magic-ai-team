export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function reportCommandFailure(options: {
  error: unknown;
  errorFn: (message: string) => void;
  infoFn?: (message: string) => void;
  nextHint?: string;
  exitCode?: number;
}): void {
  options.errorFn(toErrorMessage(options.error));
  if (options.nextHint && options.infoFn) {
    options.infoFn(options.nextHint);
  }
  process.exitCode = options.exitCode ?? 1;
}

