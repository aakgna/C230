import type { FirmContext } from "./firm-context";

export class ForbiddenError extends Error {
  constructor(action: string) {
    super(`Not permitted: ${action}`);
    this.name = "ForbiddenError";
  }
}

export function requireFirmAdmin(ctx: FirmContext, action: string) {
  if (ctx.appRole !== "firm_admin") {
    throw new ForbiddenError(action);
  }
}

export function requireOwner(ctx: FirmContext, action: string) {
  if (!ctx.isOwner) {
    throw new ForbiddenError(action);
  }
}

/**
 * Only whoever the submission is currently assigned to may act on it — not "any qualified
 * reviewer at this level or above," since the whole point of the chain is that it's someone's
 * specific turn. Assignment itself (getEligibleNextReviewers in lib/verification/review-chain.ts)
 * is what enforces who's eligible to receive an assignment in the first place.
 */
export function requireCurrentAssignee(
  ctx: FirmContext,
  submission: { currentAssigneeId: string },
  action: string
) {
  if (ctx.userId !== submission.currentAssigneeId) {
    throw new ForbiddenError(action);
  }
}

/**
 * "Verified by a person other than the one making the claims": a submission can't be decided
 * by whoever submitted it, or by the practitioner named on it (in case someone submits on
 * another practitioner's behalf). Takes only already-loaded primitives — the caller is
 * responsible for fetching the submission row first.
 */
export function requireIndependentReviewer(
  ctx: FirmContext,
  submission: { submittedBy: string; practitionerId: string },
  action: string
) {
  if (submission.submittedBy === ctx.userId || submission.practitionerId === ctx.userId) {
    throw new ForbiddenError(action);
  }
}

/**
 * Encodes the promotion/demotion hierarchy: any admin/owner can promote a practitioner to
 * admin, but only the owner may demote a firm_admin back to practitioner (regular admins
 * can't do that to each other, or to themselves — only the owner can). The owner's own role
 * can't be changed by anyone (ownership transfer is out of scope).
 */
export function requireCanSetRole(
  ctx: FirmContext,
  target: { appRole: "firm_admin" | "practitioner"; isTargetOwner: boolean },
  nextRole: "firm_admin" | "practitioner",
  action: string
) {
  requireFirmAdmin(ctx, action);

  if (target.isTargetOwner) {
    throw new ForbiddenError(action);
  }

  if (target.appRole === "firm_admin" && nextRole === "practitioner" && !ctx.isOwner) {
    throw new ForbiddenError(action);
  }
}
