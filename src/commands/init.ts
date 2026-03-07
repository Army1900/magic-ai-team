import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";
import { defaultTeamTemplate } from "../core/templates";
import { ensureDir, fileExists, resolveHomeOpenTeamConfigPath, writeYamlFile } from "../core/config";
import { banner, error, info, success } from "../core/ui";

function ensureDefaultContextDocs(): void {
  const defaults: Array<{ path: string; content: string }> = [
    {
      path: "docs/team/culture.md",
      content: "# Team Culture\n\n- User outcomes first\n- Clarity over complexity\n- Reversible changes by default\n"
    },
    {
      path: "docs/team/communication-style.md",
      content: "# Communication Style\n\n- Direct and concise\n- State assumptions explicitly\n- Report risks early\n"
    },
    {
      path: "docs/team/work-rhythm.md",
      content: "# Work Rhythm\n\n- Weekly planning\n- Daily progress check\n- Small, frequent releases\n"
    },
    {
      path: "docs/team/collaboration-rules.md",
      content: "# Collaboration Rules\n\n- Clear handoff contracts\n- Evaluator reviews before release\n- Policy guard can block unsafe runs\n"
    },
    {
      path: "docs/team/risk-policy.md",
      content: "# Risk Policy\n\n- High-risk resources require explicit approval\n- Low-trust skills are blocked by default\n"
    }
  ];

  for (const item of defaults) {
    const fullPath = path.resolve(item.path);
    if (!fs.existsSync(fullPath)) {
      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, item.content, "utf8");
    }
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new model-driven agent team config")
    .option("-n, --name <name>", "team name")
    .option("-g, --goal <goal>", "team goal")
    .option("-o, --out <path>", "output path", "team.yaml")
    .option("-f, --force", "overwrite existing file", false)
    .action(async (options) => {
      const outPath = path.resolve(options.out);
      const exists = fileExists(outPath);
      if (exists && !options.force) {
        error(`File already exists: ${outPath}. Use --force to overwrite.`);
        process.exitCode = 1;
        return;
      }

      let name = options.name as string | undefined;
      let goal = options.goal as string | undefined;

      if (!name || !goal) {
        const rl = readline.createInterface({ input, output });
        name = name ?? (await rl.question("Team name: "));
        goal = goal ?? (await rl.question("Team goal: "));
        rl.close();
      }

      const team = defaultTeamTemplate(name!.trim(), goal!.trim());
      ensureDir(path.dirname(outPath));
      writeYamlFile(outPath, team);

      const openTeamPath = resolveHomeOpenTeamConfigPath();
      if (!fs.existsSync(openTeamPath)) {
        const defaultOpenTeam = {
          version: "1.0",
          marketplaces: [
            {
              id: "official",
              kind: "official",
              url: "https://registry.openteam.dev",
              enabled: true
            }
          ],
          resolution_policy: {
            source_priority: ["private", "official", "github", "ai-generated"],
            allow_ai_generated: true,
            min_trust_score: 0.7
          }
        };
        ensureDir(path.dirname(openTeamPath));
        writeYamlFile(openTeamPath, defaultOpenTeam);
      }

      ensureDir(".openteam/cache");
      ensureDir(".openteam/runs");
      ensureDir(".openteam/reports");
      ensureDir(".openteam/versions");
      ensureDefaultContextDocs();

      banner("Initialized", "OpenTeam project scaffolding");
      success(`Team config: ${outPath}`);
      info(`Generated helper config: ${openTeamPath}`);
      info("Next steps:");
      info("  1) openteam validate");
      info("  2) openteam doctor");
    });
}
