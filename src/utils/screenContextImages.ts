import type { ScreenContextImage } from "../types/electron";

/**
 * A request's screenshots, as a list.
 *
 * Dictation attaches one screenshot; the meeting cue card's observe attaches
 * one per display. Every provider client reads through this so a single
 * image and a list are the same case — and so an empty list never counts as
 * "a screenshot is attached", which `[]` would as a bare truthiness check.
 *
 * Pure — no Electron, no store.
 */
export function screenContextImages(
  context: ScreenContextImage | ScreenContextImage[] | null | undefined
): ScreenContextImage[] {
  if (!context) return [];
  const list = Array.isArray(context) ? context : [context];
  return list.filter((image) => !!image && typeof image.data === "string" && image.data.length > 0);
}

export function screenImageDataUrl(image: ScreenContextImage): string {
  return `data:${image.mediaType};base64,${image.data}`;
}

/**
 * The parts a user message carries for its screenshots: each image, and —
 * only when there is more than one — a one-line text label ahead of it, so
 * the model can say which screen it read. A lone screenshot needs no label;
 * the system prompt already says one is attached.
 */
export function screenImageParts<TText, TImage>(
  images: readonly ScreenContextImage[],
  toText: (text: string) => TText,
  toImage: (image: ScreenContextImage) => TImage
): Array<TText | TImage> {
  const labeled = images.length > 1;
  return images.flatMap((image) =>
    labeled && image.label ? [toText(`${image.label}:`), toImage(image)] : [toImage(image)]
  );
}
