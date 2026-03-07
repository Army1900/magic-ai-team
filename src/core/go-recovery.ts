import fs from "node:fs";
import path from "node:path";
import { ensureOpenTeamHome } from "./home";
import { ExportTarget } from "./targets";

export interface GoRecoveryState {
  version: "1.0";
  status: "running" | "failed" | "completed";
  phase: "up" | "export" | "handoff" | "start";
  updated_at: string;
  options: {
    target: ExportTarget;
    project: string;
    run: boolean;
    should_start: boolean;
  };
  artifacts: {
    team_slug?: string;
    team_file?: string;
    manifest?: string;
    handoff_brief?: string;
    handoff_prompt?: string;
    start_exit_code?: number | null;
  };
  last_error?: string;
}

function recoveryPath(): string {
  const home = ensureOpenTeamHome();
  const dir = path.join(home, "recovery");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "go-last.json");
}

function nowIso(): string {
  return new Date().toISOString();
}

export function loadGoRecovery(): GoRecoveryState | null {
  const p = recoveryPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as GoRecoveryState;
  } catch {
    return null;
  }
}

export async function loadGoRecoveryAsync(): Promise<GoRecoveryState | null> {
  const p = recoveryPath();
  try {
    await fs.promises.access(p);
  } catch {
    return null;
  }
  try {
    const raw = await fs.promises.readFile(p, "utf8");
    return JSON.parse(raw) as GoRecoveryState;
  } catch {
    return null;
  }
}

export function saveGoRecovery(state: GoRecoveryState): string {
  const p = recoveryPath();
  fs.writeFileSync(
    p,
    JSON.stringify(
      {
        ...state,
        updated_at: nowIso()
      },
      null,
      2
    ),
    "utf8"
  );
  return p;
}

export async function saveGoRecoveryAsync(state: GoRecoveryState): Promise<string> {
  const p = recoveryPath();
  await fs.promises.writeFile(
    p,
    JSON.stringify(
      {
        ...state,
        updated_at: nowIso()
      },
      null,
      2
    ),
    "utf8"
  );
  return p;
}

export function initGoRecovery(options: GoRecoveryState["options"]): GoRecoveryState {
  return {
    version: "1.0",
    status: "running",
    phase: "up",
    updated_at: nowIso(),
    options,
    artifacts: {}
  };
}
