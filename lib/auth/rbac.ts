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
