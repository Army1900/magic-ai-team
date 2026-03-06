# OpenTeam v0.1

Model-driven Team OS CLI for creating and managing AI agent teams.

## What It Does

- Guided team bootstrap (`openteam up`)
- Team registry management in `OPENTEAM_HOME`
- Policy/compatibility gates before export
- Run -> evaluate -> optimize loop
- Export to `opencode`, `openclaw`, `claude`, `codex`, `aider`, `continue`, `cline`, `openhands`, `tabby`
- Provider-centric model management (`current_provider` + `providers.<provider>.models`)
- Project worklog and progress monitoring (`<project>/.openteam/worklog`)

## Prerequisites

- Node.js `>= 18`
- npm `>= 9`

## Install

```bash
npm install
npm run build
npm link
openteam --help
```

Without global link:

```bash
npx openteam --help
```

## 3-Minute Quick Start

```bash
openteam quickstart
openteam go --project D:\Projects\my-app --target claude
openteam status
openteam export --target claude --out D:\Projects\my-app
openteam handoff --project D:\Projects\my-app
openteam start --project D:\Projects\my-app
openteam monitor status --project D:\Projects\my-app
```

`openteam quickstart` / `openteam up` are guided (multi-step Q&A):
- problem / outcome / constraints are template-first (with custom input fallback)
- target / priority / human-loop are choice-based

## Default Workspace (`OPENTEAM_HOME`)

OpenTeam stores teams in a central home directory:

1. Use `OPENTEAM_HOME` if set
2. Otherwise use:
   - Windows: `%USERPROFILE%\.openteam`
   - macOS/Linux: `~/.openteam`

Layout:

- `<OPENTEAM_HOME>/registry.json`
- `<OPENTEAM_HOME>/teams/<team-slug>/team.yaml`
- `<OPENTEAM_HOME>/teams/<team-slug>/discovery-summary.md`
- `<OPENTEAM_HOME>/teams/<team-slug>/planning-note.md`
- `<OPENTEAM_HOME>/teams/<team-slug>/runs/*.json`
- `<OPENTEAM_HOME>/teams/<team-slug>/reports/*.json`

## Team Registry Commands

```bash
openteam team create --name "Support Team" --goal "Automate support triage"
openteam team list
openteam team use --name support-team
openteam team current
openteam team show --name support-team
openteam team path --name support-team
```

Command notes:
- `team create`: Create a team in the central registry (`OPENTEAM_HOME`).
- `team list`: List all teams in the registry.
- `team use`: Set the current team (most commands use this by default).
- `team current`: Show the currently selected team.
- `team show`: Show details for one team.
- `team path`: Print only the `team.yaml` path (useful for scripts).

## Main Workflow

### 1) Guided Bootstrap / One-Command

```bash
openteam go --project D:\Projects\my-app --target claude
openteam go --project D:\Projects\my-app --target claude --non-interactive --yes
openteam go --project D:\Projects\my-app --target claude --no-start

openteam quickstart
openteam quickstart --target claude --out D:\Projects\my-app
openteam quickstart --verbose
openteam up
openteam up --name "My Team" --goal "Automate support triage" --target opencode
openteam up --name "My Team" --goal "Automate support triage" --target opencode --non-interactive
openteam up --verbose
```

Flow in `up`:
- create/use registry team
- validate schema
- policy gate
- simulate one task
- evaluate report
- compatibility check for selected target

### 2) Status / Validation

```bash
openteam status
openteam validate
openteam doctor
```

Command notes:
- `status`: Show team health, model setup, policy status, and latest artifacts.
- `validate`: Validate the team config schema.
- `doctor`: Run environment/config checks (keys, provider, schema).

### 3) Run / Evaluate / Optimize

```bash
openteam run --task "Draft a support escalation policy" --execution-mode mock
openteam evaluate --run <run_id>
openteam optimize --run <run_id> --apply
openteam run --task "Draft a support escalation policy" --execution-mode live --project D:\Projects\my-app
```

Command notes:
- `run`: Execute one task (`mock|live`).
- `evaluate`: Score a run and generate an evaluation report.
- `optimize`: Generate optimization changes from run data; `--apply` persists them.
- Add `--project <path>` to write operation events into that project's `.openteam/worklog`.

### 4) Export to Framework

```bash
openteam export --target opencode --out D:\Projects\my-app
openteam export --target openclaw --out D:\Projects\my-app
openteam export --target claude --out D:\Projects\my-app
openteam export --target codex --out D:\Projects\my-app
openteam export --target aider --out D:\Projects\my-app
openteam export --target continue --out D:\Projects\my-app
openteam export --target cline --out D:\Projects\my-app
openteam export --target openhands --out D:\Projects\my-app
openteam export --target tabby --out D:\Projects\my-app
```

With strict gate:

```bash
openteam export --target claude --out D:\Projects\my-app --strict
openteam export --target codex --out D:\Projects\my-app --strict-target
```

### 5) Handoff and Start Team Work

```bash
# Generate handoff package (brief + start prompt)
openteam handoff --project D:\Projects\my-app

# Start target tool (default: detect target from latest export manifest)
openteam start --project D:\Projects\my-app

# Preview only
openteam start --project D:\Projects\my-app --dry-run

# Attempt one-shot run by piping START_PROMPT to tool stdin
openteam start --project D:\Projects\my-app --run --yes

# Override launch command if needed
openteam start --project D:\Projects\my-app --tool-cmd "claude"
```

## Export Output

- `opencode` -> `.opencode/team.json`
- `opencode` MCP -> `.opencode/mcp.json`
- `openclaw` -> `.openclaw/openclaw.team.yaml`
- `openclaw` MCP -> `.openclaw/mcp.openclaw.yaml`
- `claude` -> `.claude/agents.json` + `.claude/skills.json`
- `claude` MCP -> `.claude/mcp.json`
- `codex` -> `.codex/agents.json` + `.codex/skills.json` + `.codex/codex.team.json`
- `codex` MCP -> `.codex/mcp.json`
- `aider` -> `.aider/aider.team.json`
- `aider` MCP -> `.aider/mcp.json`
- `continue` -> `.continue/config.yaml`
- `continue` MCP -> `.continue/mcp.json`
- `cline` -> `.cline/agents.json`
- `cline` MCP -> `.cline/mcp.json`
- `openhands` -> `.openhands/workflow.json`
- `openhands` MCP -> `.openhands/mcp.json`
- `tabby` -> `.tabby/tabby.team.json`
- `tabby` MCP -> `.tabby/mcp.json`
- manifest -> `.openteam-export/manifest.json`
- handoff package ->
  - `.openteam/handoff/TEAM_BRIEF.md`
  - `.openteam/handoff/START_PROMPT.md`
  - `.openteam/handoff/handoff.json`
- project worklog (auto-initialized) ->
  - `.openteam/worklog/events.jsonl`
  - `.openteam/worklog/daily/YYYY-MM-DD.md`
  - `.openteam/worklog/summary.json`
  - `.openteam/templates/progress-report.md` (editable report template)

## Minimal Export Scenarios (Copy/Paste)

Use one of these after `openteam quickstart` (or `openteam up`) to generate target-ready files:

```bash
# Aider
openteam export --target aider --out D:\Projects\my-app --strict-target
# Output: .aider/aider.team.json + .aider/mcp.json

# Continue
openteam export --target continue --out D:\Projects\my-app --strict-target
# Output: .continue/config.yaml + .continue/mcp.json

# Cline
openteam export --target cline --out D:\Projects\my-app --strict-target
# Output: .cline/agents.json + .cline/mcp.json

# OpenHands
openteam export --target openhands --out D:\Projects\my-app --strict-target
# Output: .openhands/workflow.json + .openhands/mcp.json

# Tabby
openteam export --target tabby --out D:\Projects\my-app --strict-target
# Output: .tabby/tabby.team.json + .tabby/mcp.json
```

## Monitor Team Progress

Worklog is stored in target project path under `.openteam/worklog`.

```bash
openteam monitor status --project D:\Projects\my-app
openteam monitor tail --project D:\Projects\my-app -n 30
openteam monitor report --project D:\Projects\my-app --since 24h
openteam monitor report --project D:\Projects\my-app --since 24h --md
openteam monitor report --project D:\Projects\my-app --since 24h --write
openteam monitor report --project D:\Projects\my-app --since 24h --md --var kpi_owner="Ops Team"
openteam monitor report --project D:\Projects\my-app --since 24h --write --vars-file .openteam/templates/progress.vars.json
```

Command notes:
- `monitor status`: Show overall worklog health and latest event.
- `monitor tail`: Show the latest N worklog events.
- `monitor report`: Show metrics for a time window (for example `24h`, `7d`).
- `monitor report --md`: Render a markdown progress report from editable template.
- `monitor report --write [path]`: Write markdown report to file (default path under `.openteam/worklog/reports`).
- `monitor report --var key=value`: Inject custom placeholder values (repeatable).
- `monitor report --vars-file <json>`: Load custom placeholder values from JSON file.
- Edit template: `.openteam/templates/progress-report.md`.

Template placeholders:
- built-in: `{{generated_at}}`, `{{project}}`, `{{since}}`, `{{team}}`, `{{total_events}}`, `{{status_summary}}`, `{{type_breakdown}}`, `{{overall_plan}}`, `{{kpi_summary}}`, `{{risk_level}}`, `{{blockers_owner}}`, `{{agent_completed}}`, `{{progress}}`, `{{todo}}`
- custom: any `{{your_key}}` provided via `--var your_key=value` or `--vars-file`

## Command Defaults (Important)

Commands that default to **current registry team**:
- `quickstart`
- `up`
- `status`
- `validate`
- `doctor`
- `run` (`--team` / `--file` optional)
- `simulate`
- `evaluate`
- `context list|add|lint`
- `create agent|skill|mcp` (when `--attach`)
- `compare`/`rollback` for team file (with `--file` override)
- `policy show`
- `policy enforce`
- `optimize`
- `export`

Fallback rule: if no current team is selected and local `team.yaml` exists, OpenTeam uses local `team.yaml`.

Commands that default to local **`team.yaml`** unless you pass file options:
- `init` output path defaults to `team.yaml`
- `create agent|skill|mcp` when not attaching (draft generation only)
- versions directory defaults remain local: `.openteam/versions`

## AI Model Configuration (OpenTeam Management Layer)

OpenTeam itself is model-driven for planner/optimizer/exporter mapping.

Configure in `openteam.yaml`:

```yaml
current_provider: openai

providers:
  openai:
    base_url: https://api.openai.com/v1
    api_key_env: OPENAI_API_KEY
    # api_key: sk-...   # optional, not recommended to commit
    models:
      default: gpt-5-mini
      planner: gpt-5
      optimizer: gpt-5-mini
      exporter_mapper: gpt-5-mini
  anthropic:
    base_url: https://api.anthropic.com
    api_key_env: ANTHROPIC_API_KEY
    # api_key: sk-ant-...  # optional, not recommended to commit
    models:
      default: claude-sonnet-4
      planner: claude-sonnet-4
      optimizer: claude-sonnet-4
      exporter_mapper: claude-sonnet-4
```

Model resolution priority:
1. CLI override (`--optimizer-model`, `--mapper-model`)
2. `openteam.yaml` `current_provider` + `providers.<provider>.models.<role>`
3. `providers.<provider>.models.default`
4. Built-in defaults

Provider auth/base URL priority:
1. `openteam.yaml` `providers.<provider>.api_key` / `base_url`
2. Env via `providers.<provider>.api_key_env`
3. Default env names (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) and default base URLs

### Live Execution

Set provider keys (PowerShell):

```bash
$env:OPENAI_API_KEY = "..."
$env:ANTHROPIC_API_KEY = "..."
```

Then:

```bash
openteam run --task "Summarize support trends" --execution-mode live
```

Check provider runtime and connectivity:

```bash
openteam provider list
openteam provider test
openteam provider test --provider openai --timeout-ms 12000
```

Switch active provider in config:

```yaml
current_provider: anthropic
```

`up` auto-selects planner execution mode:
- with keys: `live`
- without keys: `mock` fallback

## CLI Themes

Supported themes:
- `nord`
- `dracula`
- `gruvbox`
- `solarized-dark`

Usage:

```bash
openteam theme list
openteam theme set --name dracula
openteam --theme gruvbox status
openteam --no-color status
```

## Context / Marketplace / Resource Creation

```bash
openteam context list
openteam context add --path docs/team/culture.md
openteam context lint

openteam marketplace list
openteam marketplace add --id community --kind github --url https://github.com/topics/openteam-skill
openteam marketplace sync

openteam create agent --from-role "QA Reviewer" --attach
openteam create skill --from-goal "Support ticket classifier" --risk-level low --trust-score 0.5 --attach --auto-comply
openteam create mcp --from-api "https://api.example.com/openapi.json" --attach
```

## Command Cheatsheet

- `quickstart`: Beginner entrypoint; guided team setup with optional export.
- `go`: One-command orchestrator (`up -> export -> handoff -> start`), best for non-technical users.
- `up`: Guided setup only (no automatic export); more flexible than quickstart.
- `team`: Registry operations (create/select/show teams).
- `status`: Show current team operational summary.
- `validate`: Validate team config schema.
- `doctor`: Check environment/provider/config readiness.
- `run`: Execute one task (`mock` or `live`).
- `simulate`: Run offline batch simulation from dataset.
- `evaluate`: Generate evaluation report for a run.
- `optimize`: Propose/apply improvements from run results.
- `export`: Export to `opencode/openclaw/claude/codex/aider/continue/cline/openhands/tabby` and initialize project worklog.
- `handoff`: Generate a team handoff package in project `.openteam/handoff`.
- `start`: Launch target tool with handoff context; optional `--run` for one-shot start.
- `monitor`: Read project `.openteam/worklog` progress and metrics.
- `provider`: Inspect and test provider auth/connectivity.
- `policy`: Inspect/enforce policy gates (`risk`, `trust`, `approval`).
- `create`: Generate `agent/skill/mcp` drafts and optionally attach to team.
- `context`: Manage team context docs (`culture`, `rules`, etc.).
- `compare`: Diff two team versions.
- `rollback`: Roll back to a previous team version.
- `marketplace`: Manage skill/mcp source registries.
- `theme`: Configure CLI theme.
- `init`: Initialize local file-mode setup (advanced).

## Architecture (Current)

Two planes:

1. Control plane
- planner
- optimizer
- exporter mapper

2. Execution plane
- execution agents with model/skill/mcp bindings
- policy and observability defined in `team.yaml`

Core loop:
1. Define goal
2. Build team
3. Run / simulate
4. Evaluate
5. Optimize
6. Export

## Config Files

- `openteam.yaml`: global settings (ui, marketplaces, providers, current_provider)
- `team.yaml`: team definition (if using local-file mode)
- Registry team file: `<OPENTEAM_HOME>/teams/<slug>/team.yaml`

## Development

```bash
npm run build
npm run start
```

Direct run without global link:

```bash
node dist/index.js --help
```
