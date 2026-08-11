import { z } from "zod";

export const dateOnlyToIsoSchema = z.string().transform((value, ctx) => {
  if (z.string().datetime().safeParse(value).success) return value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return z.NEVER;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  ) {
    return date.toISOString();
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
  return z.NEVER;
});
