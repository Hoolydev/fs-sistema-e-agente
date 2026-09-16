import type { RpaRequest, RpaResult } from "../domain/types.js";

export interface EcacAutomation {
  obtainDocument(request: RpaRequest): Promise<RpaResult>;
}

export class HumanInterventionRequired extends Error {
  constructor(
    message: string,
    readonly reason:
      | "captcha"
      | "additional_authentication"
      | "portal_changed"
      | "workflow_not_configured"
      | "certificate_rejected"
      | "profile_not_authorized"
      | "profile_mismatch",
  ) {
    super(message);
    this.name = "HumanInterventionRequired";
  }
}
