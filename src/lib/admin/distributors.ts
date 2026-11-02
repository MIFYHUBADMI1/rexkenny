import type { Distributor } from "@/lib/admin/catalogue";

/**
 * Distributor "adapters".
 *
 * The word is used deliberately narrowly: an adapter here knows what a
 * distributor requires and how a release physically gets to them on this
 * deployment. It cannot submit anything, because nothing on this site holds
 * distributor credentials — `distributors.api_connected` is false for every
 * seeded row and only an admin with database access may change it.
 *
 * If a real API is wired up later, the webhook handler is the only place
 * `api_verified` may be set true (see the policy in 0004_distribution.sql), and
 * this file gains a second branch. Until then, every adapter is a manual one.
 */
export type DistributorAdapter = {
  distributor: Distributor;
  /** Only true with tested credentials. Never inferred from a website field. */
  canSubmitProgrammatically: boolean;
  requirements: {
    isrc: boolean;
    upc: boolean;
    minArtworkPx: number;
    territories: string[];
  };
  /** What the artist actually has to do. Written for a human to follow. */
  steps: string[];
  label: string;
};

export function adapterFor(distributor: Distributor): DistributorAdapter {
  const connected = distributor.apiConnected && distributor.deliveryMode === "api";

  return {
    distributor,
    canSubmitProgrammatically: connected,
    requirements: {
      isrc: distributor.requiresIsrc,
      upc: distributor.requiresUpc,
      minArtworkPx: distributor.minArtworkPx,
      territories: distributor.supportedTerritories,
    },
    label: connected
      ? "Connected — submissions can be sent from the admin"
      : distributor.deliveryMode === "manual"
        ? "Manual — you upload on the distributor's own site"
        : distributor.deliveryMode === "sftp"
          ? "SFTP — files are delivered outside this site"
          : "Not available for this distributor",
    steps: connected
      ? [
          "Check readiness and fix every blocking item.",
          "Send the submission from the release page.",
          "The status updates from the distributor's response, and that response is stored.",
        ]
      : [
          "Check readiness on this release and clear every blocking item.",
          "Download the metadata sheet (JSON or CSV) from the release page.",
          `Sign in at ${distributor.website ?? "the distributor"} and start a new release submission.`,
          "Copy the values across and upload the artwork and audio there.",
          "Come back here and record what the distributor showed you. Until you do, this site says nothing has been submitted — because as far as this site knows, that is true.",
        ],
  };
}

/**
 * Readiness requirements a specific distributor adds on top of the general
 * checklist. Used by evaluateReadiness so the score reflects the store the
 * admin is actually preparing for.
 */
export function requirementsFor(adapters: DistributorAdapter[]) {
  return {
    requiresIsrc: adapters.some((a) => a.requirements.isrc),
    requiresUpc: adapters.some((a) => a.requirements.upc),
    minArtworkPx: Math.max(0, ...adapters.map((a) => a.requirements.minArtworkPx)),
    territories: [
      ...new Set(adapters.flatMap((a) => a.requirements.territories)),
    ],
  };
}
