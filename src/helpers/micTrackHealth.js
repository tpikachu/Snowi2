const TRACK_READY_TIMEOUT_MS = 600;

/** The track is handing over samples (or is live and unmuted, ready to). */
export const TRACK_READY = "ready";
/**
 * The track is live but the OS is not delivering samples yet. NOT a broken
 * device: `MediaStreamTrack.muted` means "temporarily not providing data", and
 * that is the normal open state of a virtual microphone whose daemon has
 * nothing to push, of a device the OS suspended while idle, and of a mic that
 * is simply slow to spin up.
 */
export const TRACK_SILENT = "silent";
/** Ended, or no track at all — the only state that proves a device unusable. */
export const TRACK_DEAD = "dead";

// Classifies a capture track once it has had a moment to wake up.
// Resolves early on the first `unmute`/`ended`, so a healthy device costs nothing.
export const probeTrack = (track, timeoutMs) =>
  new Promise((resolve) => {
    // Dead track will never deliver audio — fail fast so the caller re-acquires.
    if (!track || track.readyState === "ended") {
      resolve(TRACK_DEAD);
      return;
    }

    // Common warm-device case: already unmuted, resolve with zero latency.
    if (!track.muted) {
      resolve(TRACK_READY);
      return;
    }

    let settled = false;
    let timer = null;

    // Clear timer and detach both listeners on every exit path (no leaks).
    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      track.removeEventListener("unmute", onUnmute);
      track.removeEventListener("ended", onEnded);
    };

    const settle = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    function onUnmute() {
      settle(TRACK_READY);
    }

    function onEnded() {
      settle(TRACK_DEAD);
    }

    track.addEventListener("unmute", onUnmute);
    track.addEventListener("ended", onEnded);

    // Neither event fired: a track that is still live has simply not started
    // producing yet, which is a different thing from a track that died.
    timer = setTimeout(() => {
      if (track.readyState === "ended") settle(TRACK_DEAD);
      else settle(track.muted ? TRACK_SILENT : TRACK_READY);
    }, timeoutMs);
  });

// Re-acquires the mic once if the first track never delivers audio (dead/muted after idle).
// getFreshConstraints must drop any pinned device id so the retry re-resolves the device.
// Returns a live stream — the original when it was healthy or the retry failed.
// Optional fallback = { getConstraints, onDeviceRejected, onFallbackUnusable } adds a second
// hop to the system default, but only for a device that is genuinely dead.
//
// The hop and the "no usable input" verdict are deliberately reserved for dead
// tracks. Treating a live-but-silent track as broken meant a virtual mic — which
// reads exactly that way until its daemon pushes the first sample — got the
// user's capture refused outright, and got itself blacklisted for the session.
export const reacquireIfDead = async (stream, getFreshConstraints, logger, fallback = null) => {
  const track = stream.getAudioTracks()[0];
  // A stream with no audio track at all is not something a re-acquire can fix
  // here; callers that care handle it themselves.
  if (!track) return stream;

  const status = await probeTrack(track, TRACK_READY_TIMEOUT_MS);
  if (status === TRACK_READY) return stream;

  const wasDead = status === TRACK_DEAD;

  // The stream we still own and must stop if a later hop replaces it.
  let current = stream;
  let retryStream = null;
  try {
    retryStream = await navigator.mediaDevices.getUserMedia(await getFreshConstraints());
    stream.getTracks().forEach((t) => t.stop());
    logger.info(
      "Re-acquired microphone after a track that delivered no audio",
      { status },
      "audio"
    );
    current = retryStream;
  } catch (error) {
    logger.warn(
      fallback && wasDead
        ? "Microphone re-acquire failed, trying the default mic"
        : "Microphone re-acquire failed, using original stream",
      { error: error.message, status },
      "audio"
    );
    // A retry that cannot even open the device counts as proof it is unusable —
    // but only when the device was dead to begin with.
    if (!fallback || !wasDead) return stream;
  }

  if (!fallback) return retryStream ?? stream;

  if (retryStream) {
    const retryStatus = await probeTrack(retryStream.getAudioTracks()[0], TRACK_READY_TIMEOUT_MS);
    // Ready means it just needed waking. Silent means the device opens fine and
    // has no signal yet — record with it rather than hopping off the input the
    // user chose on purpose.
    if (retryStatus !== TRACK_DEAD) return retryStream;
  }

  fallback.onDeviceRejected();

  let fallbackStream;
  try {
    fallbackStream = await navigator.mediaDevices.getUserMedia(await fallback.getConstraints());
  } catch (error) {
    logger.warn("Microphone fallback failed, no usable input", { error: error.message }, "audio");
    fallback.onFallbackUnusable();
    return current;
  }

  current.getTracks().forEach((t) => t.stop());
  logger.info("Fell back to the default microphone after a dead device", {}, "audio");

  const fallbackStatus = await probeTrack(
    fallbackStream.getAudioTracks()[0],
    TRACK_READY_TIMEOUT_MS
  );
  if (fallbackStatus === TRACK_DEAD) {
    fallback.onFallbackUnusable();
  }
  return fallbackStream;
};
