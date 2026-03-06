export const EXPORT_TARGETS = [
  "opencode",
  "openclaw",
  "claude",
  "codex",
  "aider",
  "continue",
  "cline",
  "openhands",
  "tabby"
] as const;

export type ExportTarget = (typeof EXPORT_TARGETS)[number];

export const EXPORT_TARGET_HELP = EXPORT_TARGETS.join("|");

export function unsupportedTargetMessage(): string {
  return `Unsupported target. Use one of: ${EXPORT_TARGETS.join(", ")}`;
}

export function isExportTarget(value: string): value is ExportTarget {
  const lowered = value.toLowerCase();
  return EXPORT_TARGETS.includes(lowered as ExportTarget);
}

export function normalizeExportTarget(value: string): ExportTarget {
  const lowered = value.toLowerCase();
  if (isExportTarget(lowered)) {
    return lowered;
  }
  throw new Error(unsupportedTargetMessage());
}

export function getDefaultToolCommand(target: ExportTarget): string {
  return target;
}

