import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import ApiKeyInput from "../ui/ApiKeyInput";
import { GetApiKeyLink } from "../ui/GetApiKeyLink";
import { getTranscriptionProviders } from "../../models/ModelRegistry";
import { useSettingsStore } from "../../stores/settingsStore";
import { getRemoteProviderIcon } from "../../utils/providerIcons";
import {
  PROVIDER_CREDENTIALS,
  type ProviderCredentialField,
} from "../transcription/providerCredentials";
import { orderCloudProviders, recommendCloudProvider } from "./cloudProviderRecommendation";
import { cn } from "../lib/utils";

interface CloudProviderSetupProps {
  /** The use cases chosen on the first step — they steer the recommendation. */
  useCases: string[];
}

/**
 * The onboarding face of cloud transcription: one card per service, in words —
 * what it's like, not what it's called internally. The full picker with its
 * provider tabs, model lists and base-URL field stays behind the Advanced
 * link; someone who has never bought an API key gets a recommended first
 * click and exactly the credential fields that service needs.
 *
 * Selection goes through switchCloudTranscriptionProvider so the provider and
 * its model are written together, with the same per-provider model memory the
 * settings picker uses.
 */
export default function CloudProviderSetup({ useCases }: CloudProviderSetupProps) {
  const { t } = useTranslation();

  const selectedProvider = useSettingsStore((s) => s.cloudTranscriptionProvider);
  const switchCloudTranscriptionProvider = useSettingsStore(
    (s) => s.switchCloudTranscriptionProvider
  );

  const openaiApiKey = useSettingsStore((s) => s.openaiApiKey);
  const setOpenaiApiKey = useSettingsStore((s) => s.setOpenaiApiKey);
  const groqApiKey = useSettingsStore((s) => s.groqApiKey);
  const setGroqApiKey = useSettingsStore((s) => s.setGroqApiKey);
  const xaiApiKey = useSettingsStore((s) => s.xaiApiKey);
  const setXaiApiKey = useSettingsStore((s) => s.setXaiApiKey);
  const mistralApiKey = useSettingsStore((s) => s.mistralApiKey);
  const setMistralApiKey = useSettingsStore((s) => s.setMistralApiKey);
  const cortiClientId = useSettingsStore((s) => s.cortiClientId);
  const setCortiClientId = useSettingsStore((s) => s.setCortiClientId);
  const cortiClientSecret = useSettingsStore((s) => s.cortiClientSecret);
  const setCortiClientSecret = useSettingsStore((s) => s.setCortiClientSecret);
  const cortiEnvironment = useSettingsStore((s) => s.cortiEnvironment);
  const setCortiEnvironment = useSettingsStore((s) => s.setCortiEnvironment);
  const cortiTenant = useSettingsStore((s) => s.cortiTenant);
  const setCortiTenant = useSettingsStore((s) => s.setCortiTenant);
  const tinfoilApiKey = useSettingsStore((s) => s.tinfoilApiKey);
  const setTinfoilApiKey = useSettingsStore((s) => s.setTinfoilApiKey);

  const credentialValues: Record<ProviderCredentialField["key"], string> = {
    openaiApiKey,
    groqApiKey,
    xaiApiKey,
    mistralApiKey,
    cortiClientId,
    cortiClientSecret,
    cortiEnvironment,
    cortiTenant,
    tinfoilApiKey,
  };
  const credentialSetters: Record<ProviderCredentialField["key"], (value: string) => void> = {
    openaiApiKey: setOpenaiApiKey,
    groqApiKey: setGroqApiKey,
    xaiApiKey: setXaiApiKey,
    mistralApiKey: setMistralApiKey,
    cortiClientId: setCortiClientId,
    cortiClientSecret: setCortiClientSecret,
    cortiEnvironment: setCortiEnvironment,
    cortiTenant: setCortiTenant,
    tinfoilApiKey: setTinfoilApiKey,
  };

  const registryProviders = useMemo(() => getTranscriptionProviders(), []);
  const recommendedId = useMemo(
    () =>
      recommendCloudProvider(
        useCases,
        registryProviders.map((p) => p.id)
      ),
    [useCases, registryProviders]
  );
  const orderedProviders = useMemo(() => {
    const ordered = orderCloudProviders(
      registryProviders.map((p) => p.id),
      recommendedId
    );
    return ordered
      .map((id) => registryProviders.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
  }, [registryProviders, recommendedId]);

  const credentials = PROVIDER_CREDENTIALS[selectedProvider];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {orderedProviders.map((provider) => {
          const { icon, invertInDark } = getRemoteProviderIcon(provider.id);
          const selected = selectedProvider === provider.id;
          const fields = PROVIDER_CREDENTIALS[provider.id]?.fields;
          const configured = !!fields?.every(
            (field) => field.input !== "secret" || !!credentialValues[field.key]?.trim()
          );
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => switchCloudTranscriptionProvider("dictation", provider.id)}
              aria-pressed={selected}
              className={cn(
                "group relative h-full w-full rounded-surface border p-3 text-left",
                "transition-[background-color,border-color,box-shadow] duration-100 ease-snap",
                "focus-ring",
                selected
                  ? "border-border-control bg-surface-2 shadow-[var(--shadow-control),inset_2px_0_0_var(--color-primary)]"
                  : "border-border-subtle bg-surface-1 shadow-(--shadow-panel) hover:border-border-hover hover:bg-surface-2"
              )}
            >
              <div className="flex items-start gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-3">
                  {icon ? (
                    <img
                      src={icon}
                      alt=""
                      className={cn("size-3.5", invertInDark && "dark:invert")}
                    />
                  ) : (
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {provider.name.slice(0, 2)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold leading-snug text-foreground">
                      {provider.name}
                    </span>
                    {provider.id === recommendedId && (
                      <span className="rounded-[3px] border border-primary/35 bg-primary/10 px-1 py-px text-[10px] font-medium leading-tight text-primary">
                        {t("transcriptionSetup.recommendedBadge")}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    {t(`transcriptionSetup.cloud.${provider.id}.description`, {
                      defaultValue: "",
                    })}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[2px] border",
                    "transition-colors duration-100 ease-snap",
                    selected
                      ? "border-primary bg-primary"
                      : "border-border-control bg-input shadow-(--shadow-well)",
                    // A quiet check on unselected-but-ready cards: the key is
                    // already in, picking it back is one click, nothing to redo.
                    !selected && configured && "border-primary/50"
                  )}
                >
                  {(selected || configured) && (
                    <Check
                      className={cn(
                        "size-3",
                        selected ? "text-primary-foreground" : "text-primary/70"
                      )}
                      strokeWidth={2.5}
                    />
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {credentials && (
        <div className="space-y-3 rounded-control border border-border-subtle bg-surface-2 px-3 py-3">
          {credentials.fields.map((field) => {
            const value = credentialValues[field.key];
            const setValue = credentialSetters[field.key];
            const label = field.labelKey ? t(field.labelKey) : t("common.apiKey");
            if (field.input === "select") {
              return (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">{label}</label>
                  <Select value={value} onValueChange={setValue}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            }
            if (field.input === "text") {
              return (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">{label}</label>
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={field.placeholder}
                    className="h-8 text-sm"
                  />
                </div>
              );
            }
            return (
              <div key={field.key} className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">{label}</label>
                <ApiKeyInput apiKey={value} setApiKey={setValue} label="" helpText="" />
              </div>
            );
          })}
          <GetApiKeyLink url={credentials.consoleUrl} />
        </div>
      )}
    </div>
  );
}
