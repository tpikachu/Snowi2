import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";
import { ClipboardCopy, Loader2, Mail, RefreshCw, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { useToast } from "../ui/useToast";
import ModelPickerChip from "../ModelPickerChip";
import { useSettingsStore } from "../../stores/settingsStore";
import { readActionModelOverride } from "../../utils/actionModelOverride";
import {
  buildMailtoUrl,
  draftFollowUpEmail,
  participantEmailAddresses,
  FollowUpEmailError,
  type FollowUpEmailSource,
} from "../../helpers/followUpEmail";

interface FollowUpEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: FollowUpEmailSource;
}

/**
 * The follow-up email, drafted and handed over — never sent.
 *
 * The model writes a first draft from the meeting write-up; the user reads it
 * in an editable box and decides what leaves the machine. Two exits: Copy, and
 * "Open in email app", which pre-fills a mail-client draft addressed to the
 * attendees. Sending stays in the user's own mail client on purpose — an app
 * that emails people on your behalf has crossed a line this one doesn't.
 */
export default function FollowUpEmailDialog({
  open,
  onOpenChange,
  source,
}: FollowUpEmailDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // A run belongs to one open dialog; closing mid-draft discards the result.
  const runRef = useRef(0);

  // The email's own model, remembered like a per-action override; empty
  // follows the actions default. Reads through readActionModelOverride so a
  // half-cleared value never renders as a pick.
  const followUpFields = useSettingsStore(
    useShallow((s) => ({
      model_mode: s.followUpModelMode,
      model_provider: s.followUpModelProvider,
      model_id: s.followUpModelId,
    }))
  );
  const followUpOverride = readActionModelOverride(followUpFields);
  const setFollowUpModelOverride = useSettingsStore((s) => s.setFollowUpModelOverride);

  const generate = useCallback(async () => {
    const run = ++runRef.current;
    setIsDrafting(true);
    setErrorKey(null);
    try {
      const text = await draftFollowUpEmail(source);
      if (runRef.current !== run) return;
      setDraft(text);
    } catch (error) {
      if (runRef.current !== run) return;
      setErrorKey(
        error instanceof FollowUpEmailError
          ? `notes.followUpEmail.errors.${error.reason}`
          : "notes.followUpEmail.errors.failed"
      );
    } finally {
      if (runRef.current === run) setIsDrafting(false);
    }
  }, [source]);

  // Draft on open, once per opening; reopening drafts fresh because the
  // write-up may have changed since.
  useEffect(() => {
    if (open) {
      setDraft("");
      void generate();
    } else {
      runRef.current++;
      setIsDrafting(false);
      setErrorKey(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `generate` changes identity with `source`; re-drafting mid-edit on a parent render would discard the user's edits
  }, [open]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(draft);
      toast({ description: t("notes.followUpEmail.copied") });
    } catch {
      toast({ description: t("notes.recap.copyFailed"), variant: "destructive" });
    }
  }, [draft, toast, t]);

  const handleOpenMail = useCallback(() => {
    const url = buildMailtoUrl({
      to: participantEmailAddresses(source.participants),
      subject: t("notes.followUpEmail.subject", { title: source.title }),
      body: draft,
    });
    window.electronAPI?.openExternal?.(url);
  }, [draft, source.participants, source.title, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail size={14} className="text-primary" />
            {t("notes.followUpEmail.title")}
          </DialogTitle>
        </DialogHeader>

        {isDrafting ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            {t("notes.followUpEmail.drafting")}
          </div>
        ) : errorKey ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <TriangleAlert size={16} className="text-warning" />
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{t(errorKey)}</p>
            <Button variant="outline-flat" size="sm" onClick={() => void generate()}>
              <RefreshCw size={12} />
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={12}
            className="max-h-80 min-h-48 resize-none text-[13px] leading-relaxed"
            aria-label={t("notes.followUpEmail.title")}
          />
        )}

        <DialogFooter>
          <div className="flex items-center gap-1.5 sm:mr-auto">
            {/* This email's model, remembered for next time. Changing it
                re-drafts immediately — a pick with no visible effect would
                read as a pick that did nothing. */}
            <ModelPickerChip
              value={followUpOverride}
              onSelect={(selection) => {
                setFollowUpModelOverride(selection);
                void generate();
              }}
              defaultLabel={t("notes.actions.defaultModel")}
            />
            <Button variant="ghost" size="sm" onClick={() => void generate()} disabled={isDrafting}>
              <RefreshCw size={12} />
              {t("notes.followUpEmail.regenerate")}
            </Button>
          </div>
          <Button
            variant="outline-flat"
            size="sm"
            onClick={() => void handleCopy()}
            disabled={isDrafting || !!errorKey || !draft.trim()}
          >
            <ClipboardCopy size={12} />
            {t("common.copy")}
          </Button>
          <Button
            size="sm"
            onClick={handleOpenMail}
            disabled={isDrafting || !!errorKey || !draft.trim()}
          >
            <Mail size={12} />
            {t("notes.followUpEmail.openInMail")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
