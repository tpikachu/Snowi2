/**
 * Whether speaker identification runs at all.
 *
 * V1 ships without it: the microphone track is "You", the system track is
 * "Others", and nothing tries to tell one voice on the system track from
 * another. The reason is latency. Identification means a speaker-embedding
 * forward pass for every chunk of system audio, on the same path the live
 * captions travel down, and the captions are the product. Being wrong about
 * who spoke is recoverable later; being late with the words is not.
 *
 * This is a kill switch rather than a changed default, on purpose. The
 * `speakerDiarizationEnabled` preference already exists and reads `true` in
 * every install that has ever run, so moving its default would only affect
 * fresh profiles and would leave every existing user paying exactly the cost
 * the switch exists to avoid.
 *
 * Nothing is deleted. The identifier, the clustering pass, the speaker
 * profiles and the naming UI all stay in place and stay tested, so turning
 * this back to `true` restores the stored preference and everything
 * downstream of it. That is what keeps the decision cheap to revisit.
 */
export const SPEAKER_IDENTIFICATION_ENABLED = false;

/**
 * Resolve whether identification should run for a session.
 *
 * The stored preference is only consulted when the feature is on — while it is
 * off, no preference and no per-session override can switch it back on, which
 * is the property that makes "no identification work on the live path" true
 * for everyone rather than just for new installs.
 *
 * @param {boolean|undefined} storedPreference - the user's
 *   `speakerDiarizationEnabled` setting, or a per-session override of it.
 * @returns {boolean}
 */
export function isSpeakerIdentificationEnabled(storedPreference) {
  if (!SPEAKER_IDENTIFICATION_ENABLED) return false;
  return storedPreference !== false;
}
