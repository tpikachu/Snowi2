/**
 * Builds the option list for the point-of-use model picker (the chip in the
 * chat composer and on the meeting cue card).
 *
 * Pure on purpose: the component gathers the inputs (registry catalog, which
 * providers hold a key, which local models are on disk) and this module owns
 * the policy — what is offered, in what order, and what is merely advertised.
 *
 * Policy: providers the user can use RIGHT NOW come first — keyed cloud
 * providers in catalog order, then downloaded local models under one group.
 * Cloud providers without a key trail the list with no models, as one "add a
 * key" row each: the picker is also where someone discovers what a key would
 * unlock, but it never offers a model that would 401 on first use.
 */

export interface PickerModel {
  id: string;
  label: string;
}

export interface PickerCloudProviderInput {
  id: string;
  name: string;
  models: PickerModel[];
}

export interface PickerLocalModelInput {
  id: string;
  label: string;
  /** Registry provider id, needed to persist a local selection. */
  providerId: string;
}

export interface ModelPickerGroup {
  kind: "cloud" | "local";
  providerId: string;
  providerName: string;
  /** False only for the trailing keyless cloud groups. */
  hasKey: boolean;
  models: PickerModel[];
}

export function buildModelPickerGroups(input: {
  cloudProviders: PickerCloudProviderInput[];
  keyedProviderIds: ReadonlySet<string>;
  /** Downloaded-and-usable local models only. */
  localModels: PickerLocalModelInput[];
  /** Group label for the local section, already translated. */
  localGroupName: string;
}): ModelPickerGroup[] {
  const keyed: ModelPickerGroup[] = [];
  const keyless: ModelPickerGroup[] = [];
  for (const provider of input.cloudProviders) {
    if (provider.models.length === 0 && !input.keyedProviderIds.has(provider.id)) continue;
    const group: ModelPickerGroup = {
      kind: "cloud",
      providerId: provider.id,
      providerName: provider.name,
      hasKey: input.keyedProviderIds.has(provider.id),
      models: input.keyedProviderIds.has(provider.id) ? provider.models : [],
    };
    (group.hasKey ? keyed : keyless).push(group);
  }

  const local: ModelPickerGroup[] =
    input.localModels.length > 0
      ? [
          {
            kind: "local",
            providerId: "local",
            providerName: input.localGroupName,
            hasKey: true,
            models: input.localModels.map(({ id, label }) => ({ id, label })),
          },
        ]
      : [];

  return [...keyed, ...local, ...keyless];
}
