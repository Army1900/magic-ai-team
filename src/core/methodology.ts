import fs from "node:fs";
import path from "node:path";

const DEFAULT_METHOD_FILES = [
  "docs/methodology/methodology.md",
  "docs/methodology/planning-playbook.md",
  "docs/methodology/evaluation-rubric.md",
  "docs/methodology/optimization-strategy.md"
];

export function loadMethodologyGuidance(maxChars = 10000): string {
  let size = 0;
  const chunks: string[] = [];

  for (const file of DEFAULT_METHOD_FILES) {
    const fullPath = path.resolve(file);
    if (!fs.existsSync(fullPath)) {
      continue;
    }
    const text = fs.readFileSync(fullPath, "utf8").trim();
    if (!text) {
      continue;
    }
    const wrapped = `\n[${file}]\n${text}\n`;
    if (size + wrapped.length > maxChars) {
      break;
    }
    chunks.push(wrapped);
    size += wrapped.length;
  }

  return chunks.join("\n");
}
