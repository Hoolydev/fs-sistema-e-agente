import { z } from "zod";
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const basisPoints = z.number().int().min(0).max(10000);
const note = z.string().min(1).max(12000);
export const opinionSchema = z.object({
  scenario: z.object({ label: note, status: z.enum(["illustrative", "conditional", "validated"]), evidence: note, targetRating: note,
    chargesDiscountBps: basisPoints, totalDiscountCapBps: basisPoints, entryBps: basisPoints,
    entryMonths: z.number().int().min(1).max(60), balanceMonths: z.number().int().min(1).max(360), conventionalMonths: z.number().int().min(1).max(360),
    alternativeEntryMonths: z.number().int().min(1).max(60), alternativeBalanceMonths: z.number().int().min(1).max(360),
  }).nullable(),
  capagDebtBasis: cents.nullable(), capagBasisNote: note,
  annualRevenue: cents.nullable(), revenuePeriod: note,
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  windowNote: note, rescissionNote: note, judicialNote: note, certificateNote: note, capagReview: note,
  legalBasis: z.array(z.object({ title: note, application: note, status: note })),
  actions: z.array(z.object({ action: note, timing: note })), caveats: z.array(note), conclusion: note,
});
