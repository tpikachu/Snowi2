import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { TOUR_STEPS } from "../../config/tourSteps";
import { useTourStore, nextStep, previousStep, endTour, goToStep } from "../../stores/tourStore";
import { placePopover, highlightRect, isAnchorVisible, type Rect } from "../../utils/tourPlacement";
import { isModelSetupComplete, showsTourAction, tourStepBodyKey } from "../../utils/tourSetup";
import { useSettingsStore, selectResolvedLLMConfig } from "../../stores/settingsStore";

/**
 * The spotlight tour.
 *
 * Renders a dimmed backdrop with a cut-out around the element being described
 * and a popover beside it. The cut-out is four rectangles rather than an SVG
 * mask so the highlighted element stays fully interactive and crisp — a mask
 * over the whole window would blur what it is pointing at.
 *
 * Steps whose anchor is not in the DOM are skipped: several are conditionally
 * rendered, and a tour that stalls pointing at nothing is worse than a short one.
 */

const POPOVER_WIDTH = 288;

function readRect(element: Element): Rect {
  const box = element.getBoundingClientRect();
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

export default function TourOverlay({
  onNavigate,
  onOpenSettings,
}: {
  /** Switches the shell to the view a step lives on, before it is shown. */
  onNavigate?: (view: NonNullable<(typeof TOUR_STEPS)[number]["view"]>) => void;
  /** Deep-links into settings for a step's call-to-action. */
  onOpenSettings?: (section: string, panel?: string) => void;
}) {
  const { t } = useTranslation();
  const isActive = useTourStore((s) => s.isActive);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const step = TOUR_STEPS[stepIndex] ?? null;

  // Whether a model is chosen at all decides which half of the setup step the
  // user reads, and whether it offers a button.
  const setupComplete = useSettingsStore((s) =>
    isModelSetupComplete({
      noteFormattingModel: selectResolvedLLMConfig(s, "noteFormatting").model,
      chatModel: selectResolvedLLMConfig(s, "chatIntelligence").model,
    })
  );

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<Rect | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(160);

  // Switching view has to happen before the anchor is measured, or the first
  // frame measures an element the new view has not mounted yet.
  useEffect(() => {
    if (!isActive || !step?.view) return;
    onNavigate?.(step.view);
  }, [isActive, step?.view, step?.id, onNavigate]);

  const measure = useCallback(() => {
    if (!step) return;
    const element = document.querySelector(`[data-tour="${step.anchor}"]`);
    if (!element) {
      setAnchorRect(null);
      return;
    }
    setAnchorRect(readRect(element));
  }, [step]);

  useLayoutEffect(() => {
    if (!isActive) return;
    // Two frames: one for the view switch above to commit, one for layout to
    // settle before the element is measured.
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    return () => cancelAnimationFrame(raf);
  }, [isActive, stepIndex, measure]);

  useEffect(() => {
    if (!isActive) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    // Capture phase: the anchors sit inside scrolling panes, whose scroll events
    // do not bubble to window.
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [isActive, measure]);

  useLayoutEffect(() => {
    if (popoverRef.current) setPopoverHeight(popoverRef.current.offsetHeight);
  }, [stepIndex, isActive, anchorRect]);

  // A step pointing at something that is not there is skipped rather than shown.
  useEffect(() => {
    if (!isActive || !step) return;
    if (anchorRect !== null) return;
    const timer = setTimeout(() => {
      const stillMissing = !document.querySelector(`[data-tour="${step.anchor}"]`);
      if (!stillMissing) return;
      if (stepIndex >= TOUR_STEPS.length - 1) endTour();
      else goToStep(stepIndex + 1);
    }, 600);
    return () => clearTimeout(timer);
  }, [isActive, step, anchorRect, stepIndex]);

  useEffect(() => {
    if (!isActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") endTour();
      else if (event.key === "ArrowRight") nextStep();
      else if (event.key === "ArrowLeft") previousStep();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive]);

  if (!isActive || !step) return null;

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const visible = anchorRect ? isAnchorVisible(anchorRect, viewport) : false;
  const hole = visible && anchorRect ? highlightRect(anchorRect, viewport) : null;
  const placed =
    visible && anchorRect
      ? placePopover(
          step.placement,
          anchorRect,
          { top: 0, left: 0, width: POPOVER_WIDTH, height: popoverHeight },
          viewport
        )
      : {
          // No anchor to sit beside: centre it rather than pin it to a corner.
          top: viewport.height / 2 - popoverHeight / 2,
          left: viewport.width / 2 - POPOVER_WIDTH / 2,
          placement: step.placement,
        };

  const isLast = stepIndex === TOUR_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-label={t("tour.label")}
    >
      {hole ? (
        // Four panels around the cut-out. Clicking any of them dismisses, but
        // the hole itself passes clicks through to the real control.
        <>
          <Backdrop onClick={endTour} style={{ top: 0, left: 0, right: 0, height: hole.top }} />
          <Backdrop
            onClick={endTour}
            style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }}
          />
          <Backdrop
            onClick={endTour}
            style={{
              top: hole.top,
              left: hole.left + hole.width,
              right: 0,
              height: hole.height,
            }}
          />
          <Backdrop
            onClick={endTour}
            style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-lg ring-2 ring-primary transition-all duration-200"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
        </>
      ) : (
        <Backdrop onClick={endTour} style={{ inset: 0 }} />
      )}

      <div
        ref={popoverRef}
        className="absolute rounded-xl border border-border-subtle bg-card p-4 shadow-xl transition-all duration-200"
        style={{ top: placed.top, left: placed.left, width: POPOVER_WIDTH }}
      >
        <h2 className="text-sm font-semibold text-foreground">{t(step.titleKey)}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {t(tourStepBodyKey(step, setupComplete))}
        </p>

        {step.action && showsTourAction(step, setupComplete) && (
          // Ends the tour rather than leaving it running behind the settings
          // surface: the overlay would spotlight a rail button the modal has
          // just covered.
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 w-full text-xs"
            onClick={() => {
              endTour();
              onOpenSettings?.(step.action!.settingsSection, step.action!.settingsPanel);
            }}
          >
            {t(step.action.labelKey)}
          </Button>
        )}

        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5" aria-hidden="true">
            {TOUR_STEPS.map((s, index) => (
              <span
                key={s.id}
                className={[
                  "h-1.5 rounded-full transition-all",
                  index === stepIndex ? "w-4 bg-primary" : "w-1.5 bg-foreground/15",
                ].join(" ")}
              />
            ))}
          </div>

          {stepIndex > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={previousStep}>
              {t("tour.back")}
            </Button>
          )}
          <Button variant="default" size="sm" className="h-7 text-xs" onClick={nextStep}>
            {isLast ? t("tour.finish") : t("tour.next")}
          </Button>
        </div>

        {!isLast && (
          <button
            type="button"
            onClick={endTour}
            className="mt-2 text-[11px] text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
          >
            {t("tour.skip")}
          </button>
        )}
      </div>
    </div>
  );
}

function Backdrop({ style, onClick }: { style: React.CSSProperties; onClick: () => void }) {
  return (
    <div
      className="absolute bg-black/50 transition-opacity duration-200"
      style={style}
      onClick={onClick}
    />
  );
}
