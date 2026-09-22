import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "./ui/useToast";
import { configureToastProps } from "./ui/configureToastProps";
import { useRouteNoticeStore, consumeRouteNotices } from "../stores/routeNoticeStore";
import { getCloudModel, getProviderDisplayName } from "../models/ModelRegistry";
import { openrouterModelLabel } from "../config/openrouterModels";

const providerName = (id: string) =>
  id === "openrouter" ? "OpenRouter" : getProviderDisplayName(id);
const modelName = (id: string) => openrouterModelLabel(id) ?? getCloudModel(id)?.name ?? id;

/**
 * Headless. Mount once inside ToastProvider: when a provider key is removed
 * and a feature that ran on it moves elsewhere (or is left without a model),
 * this says so — one card per feature, each naming where it went and why.
 */
export default function RouteNoticeToastListener() {
  const { t } = useTranslation();
  const { toast, dismiss } = useToast();
  const count = useRouteNoticeStore((s) => s.notices.length);

  useEffect(() => {
    if (count === 0) return;
    for (const move of consumeRouteNotices()) {
      const scope = t(
        move.scope === "actions"
          ? "settingsPage.llms.scopes.writeups"
          : "settingsPage.llms.scopes.chat"
      );
      if (move.to && move.model) {
        toast({
          title: t("settingsPage.llms.reroute.title"),
          description: t("settingsPage.llms.reroute.moved", {
            scope,
            model: modelName(move.model),
            to: providerName(move.to),
            from: providerName(move.from),
          }),
          variant: "default",
        });
      } else {
        let toastId = "";
        toastId = toast({
          title: t("settingsPage.llms.reroute.needsSetupTitle"),
          description: t("settingsPage.llms.reroute.needsSetup", {
            scope,
            from: providerName(move.from),
          }),
          variant: "destructive",
          ...configureToastProps("configureChatIntelligence", () => {
            if (toastId) dismiss(toastId);
          }),
        });
      }
    }
  }, [count, toast, dismiss, t]);

  return null;
}
