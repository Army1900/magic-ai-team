import chalkLib from "chalk";

export type ThemeName = "nord" | "dracula" | "gruvbox" | "solarized-dark";

type Palette = {
  primary: string;
  secondary: string;
  success: string;
  warn: string;
  error: string;
  muted: string;
};

const THEMES: Record<ThemeName, Palette> = {
  nord: {
    primary: "#88C0D0",
    secondary: "#81A1C1",
    success: "#A3BE8C",
    warn: "#EBCB8B",
    error: "#BF616A",
    muted: "#4C566A"
  },
  dracula: {
    primary: "#BD93F9",
    secondary: "#8BE9FD",
    success: "#50FA7B",
    warn: "#F1FA8C",
    error: "#FF5555",
    muted: "#6272A4"
  },
  gruvbox: {
    primary: "#D79921",
    secondary: "#458588",
    success: "#98971A",
    warn: "#D79921",
    error: "#CC241D",
    muted: "#7C6F64"
  },
  "solarized-dark": {
    primary: "#268BD2",
    secondary: "#2AA198",
    success: "#859900",
    warn: "#B58900",
    error: "#DC322F",
    muted: "#586E75"
  }
};

let activeTheme: ThemeName = "nord";
let chalk: typeof chalkLib = chalkLib;

function c(hex: string) {
  return chalk.hex(hex);
}

export function resolveTheme(name?: string): ThemeName {
  if (!name) {
    return "nord";
  }
  const lowered = name.toLowerCase() as ThemeName;
  if (lowered in THEMES) {
    return lowered;
  }
  return "nord";
}

export function listThemes(): ThemeName[] {
  return Object.keys(THEMES) as ThemeName[];
}

export function setupUi(options?: { theme?: string; color?: boolean }): void {
  activeTheme = resolveTheme(options?.theme);
  chalk = new chalkLib.Instance({ level: options?.color === false ? 0 : 3 }) as unknown as typeof chalkLib;
}

function palette(): Palette {
  return THEMES[activeTheme];
}

export function banner(title: string, subtitle?: string): void {
  const p = palette();
  const line = c(p.primary)(`== ${title} ==`);
  console.log(line);
  if (subtitle) {
    console.log(c(p.muted)(subtitle));
  }
}

export function info(msg: string): void {
  console.log(c(palette().secondary)(msg));
}

export function success(msg: string): void {
  console.log(c(palette().success)(msg));
}

export function warn(msg: string): void {
  console.log(c(palette().warn)(msg));
}

export function error(msg: string): void {
  console.error(c(palette().error)(msg));
}

export function muted(msg: string): string {
  return c(palette().muted)(msg);
}

export function kv(key: string, value: string | number | boolean): void {
  const p = palette();
  console.log(`${c(p.primary)(key.padEnd(18))} ${String(value)}`);
}

export function status(kind: "ok" | "warn" | "fail", label: string, detail?: string): void {
  const p = palette();
  const badge =
    kind === "ok"
      ? c(p.success)("[OK]")
      : kind === "warn"
      ? c(p.warn)("[WARN]")
      : c(p.error)("[FAIL]");
  if (detail) {
    console.log(`${badge} ${label} ${muted("-")} ${detail}`);
    return;
  }
  console.log(`${badge} ${label}`);
}
