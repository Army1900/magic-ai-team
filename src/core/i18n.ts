export type Locale = "en" | "zh";

export function hasCjkText(input: string): boolean {
  return /[\u3400-\u9FFF]/.test(input || "");
}

export function resolveLocale(seed?: string): Locale {
  if (hasCjkText(seed || "")) return "zh";
  const lang = (process.env.LANG ?? process.env.LC_ALL ?? process.env.LANGUAGE ?? "").toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

const MESSAGES = {
  go_complete: {
    en: "Go Complete",
    zh: "Go 完成"
  },
  go_summary: {
    en: "Go Summary",
    zh: "Go 摘要"
  },
  go_finished: {
    en: "Go flow finished.",
    zh: "Go 流程已完成。"
  },
  go_top_issues: {
    en: "Top issues:",
    zh: "主要问题:"
  },
  go_next_monitor: {
    en: "Next: openteam monitor report --project {project} --since 24h --write",
    zh: "下一步: openteam monitor report --project {project} --since 24h --write"
  },
  go_start_skipped_no_start: {
    en: "Start skipped by --no-start.",
    zh: "根据 --no-start 已跳过 start。"
  },
  go_start_skipped_confirm: {
    en: "Start skipped by user confirmation.",
    zh: "根据你的确认已跳过 start。"
  },
  go_tool_missing: {
    en: "Tool command not found: {command}",
    zh: "未找到工具命令: {command}"
  },
  run_blocked_policy: {
    en: "Run blocked by policy gate:",
    zh: "Run 被策略门禁阻断:"
  },
  export_blocked_quality: {
    en: "Export blocked by team quality gate.",
    zh: "Export 被团队质量门禁阻断。"
  }
} as const;

export type MessageKey = keyof typeof MESSAGES;

export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number | boolean>): string {
  const template = MESSAGES[key][locale] ?? MESSAGES[key].en;
  if (!vars) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

