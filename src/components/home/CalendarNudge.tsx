import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useToast } from "../ui/useToast";
import { useSettingsStore } from "../../stores/settingsStore";
import { getCachedPlatform } from "../../utils/platform";

type Provider = "google" | "microsoft" | "apple";

/**
 * "Connect your calendar" — the sentence, not a settings page.
 *
 * The OAuth flows, the account state, and the upcoming-meetings rail all
 * shipped long ago; what never existed was a button. This is that button,
 * placed where its absence is felt: on the home screen, in the spot the
 * upcoming meetings would occupy. It disappears the moment any provider is
 * connected, because a nudge that survives being answered is a nag.
 */
export default function CalendarNudge() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const setGcalAccounts = useSettingsStore((s) => s.setGcalAccounts);
  const setMcalAccounts = useSettingsStore((s) => s.setMcalAccounts);
  const setAppleCalendarConnected = useSettingsStore((s) => s.setAppleCalendarConnected);

  const connect = useCallback(
    async (provider: Provider) => {
      if (isConnecting) return;
      setIsConnecting(true);
      try {
        if (provider === "google") {
          const result = await window.electronAPI?.gcalStartOAuth?.();
          if (!result?.success) throw new Error(result?.error);
          const status = await window.electronAPI?.gcalGetConnectionStatus?.();
          if (status?.accounts) setGcalAccounts(status.accounts.map(({ email }) => ({ email })));
        } else if (provider === "microsoft") {
          const result = await window.electronAPI?.mcalStartOAuth?.();
          if (!result?.success) throw new Error(result?.error);
          const status = await window.electronAPI?.mcalGetConnectionStatus?.();
          if (status?.accounts) setMcalAccounts(status.accounts.map(({ email }) => ({ email })));
        } else {
          const result = await window.electronAPI?.acalConnect?.();
          if (!result?.success) throw new Error(result?.error || result?.reason);
          setAppleCalendarConnected(true);
        }
      } catch {
        // A cancelled or failed OAuth window is ordinary — say so quietly and
        // leave the nudge standing for another try.
        toast({
          title: t("home.calendarNudge.failedTitle"),
          description: t("home.calendarNudge.failedDescription"),
          variant: "destructive",
        });
      } finally {
        setIsConnecting(false);
      }
    },
    [isConnecting, setGcalAccounts, setMcalAccounts, setAppleCalendarConnected, toast, t]
  );

  return (
    <div className="mt-3 text-xs leading-relaxed">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isConnecting}
            className="rounded-sm font-medium text-link underline decoration-link/30 transition-colors hover:decoration-link/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {t("home.calendarNudge.action")}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => void connect("google")}>
            {t("home.calendarNudge.google")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void connect("microsoft")}>
            {t("home.calendarNudge.microsoft")}
          </DropdownMenuItem>
          {getCachedPlatform() === "darwin" && (
            <DropdownMenuItem onClick={() => void connect("apple")}>
              {t("home.calendarNudge.apple")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>{" "}
      <span className="text-muted-foreground">{t("home.calendarNudge.description")}</span>
    </div>
  );
}
