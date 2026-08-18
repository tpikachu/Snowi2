import { create } from "zustand";
import type {
  EnterpriseSetupMode,
  ManagedEnterpriseConfig,
  ManagedEnterpriseScopeResolution,
} from "../types/enterpriseIdentity";
import type { InferenceScope } from "../config/inferenceScopes";

// Managed enterprise configuration was distributed through the (removed)
// cloud account (feature removed). Without accounts there is never a managed config,
// so this store is inert: scope resolution always falls through to manual
// (BYOK) enterprise setup. Kept only so the enterprise inference-mode plumbing
// keeps compiling until it is removed in a later phase.
interface EnterpriseIdentityState {
  accountId: string | null;
  workspaceId: string | null;
  authGeneration: number | null;
  status: "idle";
  config: ManagedEnterpriseConfig | null;
  error: string | null;
  failClosed: boolean;
}

export const useEnterpriseIdentityStore = create<EnterpriseIdentityState>(() => ({
  accountId: null,
  workspaceId: null,
  authGeneration: null,
  status: "idle",
  config: null,
  error: null,
  failClosed: false,
}));

const MANUAL_RESOLUTION: ManagedEnterpriseScopeResolution = { kind: "manual" };

/** Imperative reads (services, stores). Components should use useManagedScopeResolution. */
export function getManagedScopeResolution(
  _scope: InferenceScope,
  _setupMode: EnterpriseSetupMode
): ManagedEnterpriseScopeResolution {
  return MANUAL_RESOLUTION;
}

/** Hook variant; with no managed config the resolution is always manual. */
export function useManagedScopeResolution(
  _scope: InferenceScope,
  _setupMode: EnterpriseSetupMode
): ManagedEnterpriseScopeResolution {
  return MANUAL_RESOLUTION;
}
