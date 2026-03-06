export function suggestFixes(errorMessage: string): string[] {
  const msg = errorMessage.toLowerCase();
  const fixes: string[] = [];

  if (msg.includes("eperm") && msg.includes(".openteam")) {
    fixes.push("Set writable home: `set OPENTEAM_HOME=<writable-path>` (Windows) or `export OPENTEAM_HOME=<writable-path>`.");
    fixes.push("Then rerun the same command.");
  }

  if (msg.includes("tool command not found")) {
    fixes.push("Run `openteam launcher check` to inspect available launchers.");
    fixes.push("Override tool command with `--tool-cmd \"<command>\"`.");
  }

  if (msg.includes("does not support stdin run injection")) {
    fixes.push("Run without `--run`, then paste `.openteam/handoff/START_PROMPT.md` manually in target tool.");
  }

  if (msg.includes("args run strategy requires launchers")) {
    fixes.push("Add launcher run args template in `openteam.yaml`, e.g. launchers.<target>.run.args_template.");
  }

  if (msg.includes("no team file found")) {
    fixes.push("Select a team: `openteam team use --name <team>`.");
    fixes.push("Or create one quickly: `openteam go --target claude --project <path>`.");
  }

  if (msg.includes("openai_api_key") || msg.includes("anthropic_api_key")) {
    fixes.push("Set provider key env vars and rerun: `openteam provider test`.");
  }

  if (msg.includes("unsupported target")) {
    fixes.push("Run `openteam --help` and pick one of the listed targets.");
  }

  if (fixes.length === 0) {
    fixes.push("Run `openteam doctor` for environment diagnostics.");
  }
  return fixes;
}
