export function toJsonString(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

export function successPayload<T extends Record<string, unknown>>(payload: T): T & { success: true } {
  return {
    success: true,
    ...payload
  };
}

export function failurePayload<T extends Record<string, unknown>>(payload: T): T & { success: false } {
  return {
    success: false,
    ...payload
  };
}

