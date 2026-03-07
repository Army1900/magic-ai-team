# OpenTeam v0.1

Model-driven Team OS CLI for designing, governing, and exporting multi-agent teams.

## What OpenTeam Is

OpenTeam is not another single-agent runner. It is a Team OS layer on top of target frameworks.

- Designs multi-agent topology from discovery.
- Binds skills and MCPs to specific agents.
- Applies policy, quality, and compatibility gates before export/start.
- Exports ready-to-import bundles for mainstream agent frameworks.

## Key Features

- One-command flow: `up -> export -> handoff -> start` via `openteam go`.
- Discovery + capability-domain-first topology design (AI-first, fallback rules).
- Resource recommendation with feedback loop (run outcomes feed future ranking).
- Agent quality evaluation after run (contract/format/risk checks).
- Export self-check and team quality audit.
- Project worklog with cost/token/latency metrics.
- Recovery checkpoint with `go --resume`.

## Safety Defaults

Default behavior is conservative:

- High-risk findings are blocked by default in `go` and `export`.
- To continue anyway, pass `--ignore-high-risk`.
- Export still runs policy gate, target compatibility gate, target validation, and self-check.

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

## Quick Start

```bash
openteam
openteam go --project D:\Projects\my-app --target claude
openteam monitor status --project D:\Projects\my-app
```

Notes:

- Running `openteam` (no subcommand) defaults to `go`.
- `go` is the primary entrypoint.
- Use `--no-start` if you only want generated artifacts.

## Main Commands

### Bootstrap / Go

```bash
openteam
openteam go --project D:\Projects\my-app --target opencode
openteam go --project D:\Projects\my-app --target claude --no-start
openteam go --project D:\Projects\my-app --target codex --json
openteam go --resume
```

`go --json` includes structured phase timeline:

- `phase_timeline[]` events with `phase/state/ts/elapsed_ms/detail`
- phases: `up`, `export`, `handoff`, `start`
- states: `queued`, `running`, `done`, `fallback`, `failed`

### Up (guided team creation)

```bash
openteam up
openteam up --name "My Team" --goal "Improve QA and release safety" --target openclaw
openteam up --non-interactive --allow-mock
```

### Run / Evaluate / Optimize

```bash
openteam run --task "Draft release checklist" --execution-mode live --project D:\Projects\my-app
openteam evaluate --run <run_id>
openteam optimize --run <run_id> --apply
```

`run` now records:

- per-agent tokens/cost/latency
- budget alerts and downgrade actions
- quality findings per agent

### Export

```bash
openteam export --target opencode --out D:\Projects\my-app
openteam export --target claude --out D:\Projects\my-app --strict-target
openteam export --target codex --out D:\Projects\my-app --ignore-high-risk
```

`export` now runs:

1. Team quality gate (high-risk blocked by default)
2. Policy gate
3. Target compatibility gate
4. Target validation
5. Export self-check (files/json/launcher readiness)

## Team Quality Audit

OpenTeam quality audit includes:

- Efficiency score
- Performance score
- Security score
- Overall score
- Findings by source: `policy`, `semantic`, `scanner`

Scanner integration in current version:

- Detects tool availability (`gitleaks`, `semgrep`, `trivy`)
- Reports status in quality output
- Deep scanning command execution is reserved for next stage

## Resource Recommendation Feedback Loop

OpenTeam continuously updates recommendation priorities:

- On resource attach: increments adoption stats.
- On run completion: writes success/cost/token feedback for used skills/MCPs.
- On next recommendation: applies feedback score delta to ranking.

Feedback store path:

- `<OPENTEAM_HOME>/resource-feedback.json`

## Agent Quality Evaluation

After each run, OpenTeam evaluates per-agent minimum acceptance:

- contract presence (`input_contract`, `output_contract`)
- output format mismatch for structured contracts
- step execution status
- high-risk resource and policy conflict

If quality gate fails in `run`, process exits non-zero.

## Export Targets

Supported targets:

- `opencode`
- `openclaw`
- `claude`
- `codex`
- `aider`
- `continue`
- `cline`
- `openhands`
- `tabby`

All targets export a formal bundle by default:

- `.<target>/agents.json`
- `.<target>/skills.json`
- `.<target>/mcp.json`

Project artifacts:

- `.openteam/exports/manifest.json`
- `.openteam/handoff/TEAM_BRIEF.md`
- `.openteam/handoff/START_PROMPT.md`
- `.openteam/handoff/handoff.json`
- `.openteam/worklog/*`

## Home and Team Registry

Home resolution:

1. `OPENTEAM_HOME` (if set)
2. Windows: `%USERPROFILE%\.openteam`
3. macOS/Linux: `~/.openteam`

Core files:

- `<OPENTEAM_HOME>/openteam.yaml`
- `<OPENTEAM_HOME>/registry.json`
- `<OPENTEAM_HOME>/teams/<team-slug>/team.yaml`
- `<OPENTEAM_HOME>/recovery/go-last.json`

Team registry commands:

```bash
openteam team create --name "Support Team" --goal "Automate support triage"
openteam team list
openteam team use --name support-team
openteam team current
```

## Monitoring

```bash
openteam monitor status --project D:\Projects\my-app
openteam monitor tail --project D:\Projects\my-app -n 30
openteam monitor report --project D:\Projects\my-app --since 24h --write
```

Report includes:

- usage by agent/model
- budget alert
- token/cost summary
- markdown output via template

## Notes

- `openteam up`/`go` require AI by default; use `--allow-mock` only for explicit offline fallback.
- Use `openteam provider test --provider <openai|anthropic>` to check connectivity.
- High-risk bypass must be explicit: `--ignore-high-risk`.

