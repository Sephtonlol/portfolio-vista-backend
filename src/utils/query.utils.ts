export const getSingleQueryParam = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value) && typeof value[0] === "string") {
    const first = value[0].trim();
    return first || null;
  }
  return null;
};
