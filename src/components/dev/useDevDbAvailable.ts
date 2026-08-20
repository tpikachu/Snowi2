import { useEffect, useState } from "react";

/**
 * Whether the dev database handlers are registered in this process.
 *
 * Asked of main rather than inferred from `import.meta.env.DEV`: that flag is
 * fixed when the renderer bundle is built, and it is false for `npm start`,
 * which runs an unpackaged app — exactly the case the explorer is for.
 *
 * Null while the answer is outstanding, so callers can render nothing rather
 * than flashing the panel away.
 */
export function useDevDbAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.devDb
      .available()
      .then((ok) => !cancelled && setAvailable(Boolean(ok)))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}
