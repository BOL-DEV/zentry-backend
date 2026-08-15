export const isValidId = (value: unknown) =>
  typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value.trim());

