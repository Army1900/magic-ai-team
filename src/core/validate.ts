import Ajv from "ajv";
import { teamSchema } from "./schema";
import { TeamConfig } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn = ajv.compile(teamSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTeamConfig(config: TeamConfig): ValidationResult {
  const valid = validateFn(config);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validateFn.errors ?? []).map((e) => {
    const location = e.instancePath || "/";
    return `${location} ${e.message ?? "invalid"}`;
  });

  return { valid: false, errors };
}
