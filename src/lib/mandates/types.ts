export type MandateKind = "interactive";

/** Durable intent the runtime may pursue. v0: id + createdAt + kind only. */
export type Mandate = {
  id: string;
  createdAt: number;
  kind: MandateKind;
};
