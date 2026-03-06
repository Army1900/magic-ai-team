import { suggestFixes } from "./self-heal";

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
  includeAutoFixes?: boolean;
}): void {
  const message = toErrorMessage(options.error);
  options.errorFn(message);
  if (options.nextHint && options.infoFn) {
    options.infoFn(options.nextHint);
  }
  if (options.includeAutoFixes !== false && options.infoFn) {
    const fixes = suggestFixes(message);
    for (const fix of fixes.slice(0, 3)) {
      options.infoFn(`Fix: ${fix}`);
    }
  }
  process.exitCode = options.exitCode ?? 1;
}
