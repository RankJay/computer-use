import { z } from "zod";

/** Leaf risk schema — zero session imports so events + catalog + fold Zod share it. */
export const capabilityRiskSchema = z.enum(["low", "medium", "high"]);

export type CapabilityRisk = z.infer<typeof capabilityRiskSchema>;
