import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { FolderOpen, Copy, Check, AlertTriangle } from "lucide-react";
import { useToast } from "./ui/useToast";
import { Toggle } from "./ui/toggle";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { SettingsPanel, SettingsPanelRow, SettingsRow } from "./ui/SettingsSection";
import { useSettingsLayout } from "./ui/useSettingsLayout";
import logger from "../utils/logger";

export default function DeveloperSection() {
  const { t } = useTranslation();
  const { isCompact } = useSettingsLayout();
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const { toast } = useToast();

  const loadDebugState = useCallback(async () => {
    try {
      setIsLoading(true);
      const state = await window.electronAPI.getDebugState();
      setDebugEnabled(state.enabled);
      setLogPath(state.logPath);
    } catch (error) {
      logger.error("Failed to load debug state", { error }, "developer");
      toast({
        title: t("developerSection.toasts.loadFailed.title"),
        description: t("developerSection.toasts.loadFailed.description"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    loadDebugState();
  }, [loadDebugState]);

  const handleToggleDebug = async () => {
    if (isToggling) return;

    try {
      setIsToggling(true);
      const newState = !debugEnabled;
      const result = await window.electronAPI.setDebugLogging(newState);

      if (!result.success) {
        throw new Error(result.error || "Failed to update debug logging");
      }

      setDebugEnabled(newState);
      await loadDebugState();

      toast({
        title: newState
          ? t("developerSection.toasts.debugEnabled.title")
          : t("developerSection.toasts.debugDisabled.title"),
        description: newState
          ? t("developerSection.toasts.debugEnabled.description")
          : t("developerSection.toasts.debugDisabled.description"),
        variant: "success",
      });
    } catch (error) {
      toast({
        title: t("developerSection.toasts.updateFailed.title"),
        description: t("developerSection.toasts.updateFailed.description"),
        variant: "destructive",
      });
    } finally {
      setIsToggling(false);
    }
  };

  const handleOpenLogsFolder = async () => {
    try {
      const result = await window.electronAPI.openLogsFolder();
      if (!result.success) {
        throw new Error(result.error || "Failed to open folder");
      }
    } catch (error) {
      toast({
        title: t("developerSection.toasts.openLogsFailed.title"),
        description: t("developerSection.toasts.openLogsFailed.description"),
        variant: "destructive",
      });
    }
  };

  const handleCopyPath = async () => {
    if (!logPath) return;

    try {
      await navigator.clipboard.writeText(logPath);
      setCopiedPath(true);
      toast({
        title: t("developerSection.toasts.copied.title"),
        description: t("developerSection.toasts.copied.description"),
        variant: "success",
        duration: 2000,
      });
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (error) {
      toast({
        title: t("developerSection.toasts.copyFailed.title"),
        description: t("developerSection.toasts.copyFailed.description"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <SettingsPanel>
        <SettingsPanelRow>
          <SettingsRow
            label={t("developerSection.debugMode.label")}
            description={
              debugEnabled
                ? t("developerSection.debugMode.enabledDescription")
                : t("developerSection.debugMode.disabledDescription")
            }
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  debugEnabled ? "bg-success" : "bg-muted-foreground/40"
                }`}
              />
              <Toggle
                checked={debugEnabled}
                onChange={handleToggleDebug}
                disabled={isLoading || isToggling}
              />
            </div>
          </SettingsRow>
        </SettingsPanelRow>

        {debugEnabled && logPath && (
          <SettingsPanelRow>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("developerSection.currentLogFile")}
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border border-border-subtle bg-muted px-2.5 py-1.5 font-mono text-xs leading-relaxed text-muted-foreground">
                {logPath}
              </code>
              <Button
                onClick={handleCopyPath}
                variant="ghost"
                size="sm"
                aria-label={t("developerSection.copyPath")}
                className="size-8 shrink-0 p-0"
              >
                {copiedPath ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
          </SettingsPanelRow>
        )}

        {debugEnabled && (
          <SettingsPanelRow>
            <Button onClick={handleOpenLogsFolder} variant="outline" size="sm" className="w-full">
              <FolderOpen className="mr-2 h-3.5 w-3.5" />
              {t("developerSection.openLogsFolder")}
            </Button>
          </SettingsPanelRow>
        )}
      </SettingsPanel>

      {debugEnabled && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("developerSection.performanceNote.label")}</AlertTitle>
          <AlertDescription>{t("developerSection.performanceNote.description")}</AlertDescription>
        </Alert>
      )}

      <SettingsPanel>
        <SettingsPanelRow>
          <p className="mb-2 text-xs font-medium text-foreground">
            {t("developerSection.whatGetsLogged.title")}
          </p>
          <ul className={`grid gap-y-1.5 ${isCompact ? "grid-cols-1" : "grid-cols-2 gap-x-6"}`}>
            {[
              t("developerSection.whatGetsLogged.items.audioProcessing"),
              t("developerSection.whatGetsLogged.items.apiRequests"),
              t("developerSection.whatGetsLogged.items.ffmpegOperations"),
              t("developerSection.whatGetsLogged.items.systemDiagnostics"),
              t("developerSection.whatGetsLogged.items.transcriptionPipeline"),
              t("developerSection.whatGetsLogged.items.errorDetails"),
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-1 w-1 shrink-0 rounded-full bg-border-hover"
                />
                <span className="text-xs text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </SettingsPanelRow>
      </SettingsPanel>

      {debugEnabled && (
        <SettingsPanel>
          <SettingsPanelRow>
            <p className="mb-2 text-xs font-medium text-foreground">
              {t("developerSection.sharing.title")}
            </p>
            <ol className="space-y-1.5">
              {[
                t("developerSection.sharing.steps.0"),
                t("developerSection.sharing.steps.1"),
                t("developerSection.sharing.steps.2"),
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 w-4 shrink-0 text-right font-mono text-xs text-muted-foreground">
                    {i + 1}
                  </span>
                  <p className="text-xs leading-relaxed text-muted-foreground">{step}</p>
                </li>
              ))}
            </ol>
            <p className="mt-3 border-t border-border-subtle pt-3 text-xs text-muted-foreground">
              {t("developerSection.sharing.footer")}
            </p>
          </SettingsPanelRow>
        </SettingsPanel>
      )}
    </div>
  );
}
