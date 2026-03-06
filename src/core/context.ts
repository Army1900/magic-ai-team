import fs from "node:fs";
import path from "node:path";
import { TeamConfig } from "./types";

export interface ContextLintItem {
  path: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export function listContextDocs(team: TeamConfig): string[] {
  return team.context_docs ?? [];
}

export function addContextDoc(team: TeamConfig, docPath: string): boolean {
  const docs = team.context_docs ?? [];
  if (docs.includes(docPath)) {
    team.context_docs = docs;
    return false;
  }
  team.context_docs = [...docs, docPath];
  return true;
}

export function lintContextDocs(team: TeamConfig): ContextLintItem[] {
  const docs = listContextDocs(team);
  if (docs.length === 0) {
    return [{ path: "-", status: "warn", detail: "No context_docs configured." }];
  }

  return docs.map((doc) => {
    const fullPath = path.resolve(doc);
    if (!fs.existsSync(fullPath)) {
      return { path: doc, status: "fail", detail: "File not found" };
    }
    const content = fs.readFileSync(fullPath, "utf8").trim();
    if (!content) {
      return { path: doc, status: "warn", detail: "File is empty" };
    }
    if (!content.includes("#")) {
      return { path: doc, status: "warn", detail: "Missing markdown heading" };
    }
    return { path: doc, status: "ok", detail: "Ready" };
  });
}

export function loadContextText(team: TeamConfig, maxChars = 8000): string {
  const docs = listContextDocs(team);
  if (docs.length === 0) {
    return "";
  }

  const chunks: string[] = [];
  let total = 0;
  for (const doc of docs) {
    const fullPath = path.resolve(doc);
    if (!fs.existsSync(fullPath)) {
      continue;
    }
    const text = fs.readFileSync(fullPath, "utf8").trim();
    if (!text) {
      continue;
    }
    const labeled = `\n[${doc}]\n${text}\n`;
    if (total + labeled.length > maxChars) {
      break;
    }
    chunks.push(labeled);
    total += labeled.length;
  }
  return chunks.join("\n");
}
