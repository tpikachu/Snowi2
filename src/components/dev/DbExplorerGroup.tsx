import SettingsGroup from "../settings/SettingsGroup";
import DbExplorer from "./DbExplorer";
import { useDevDbAvailable } from "./useDevDbAvailable";

/**
 * The explorer plus its settings heading, so a packaged build shows neither.
 * Gating only the panel would leave an empty "Database" section behind.
 */
export default function DbExplorerGroup() {
  const available = useDevDbAvailable();
  if (!available) return null;

  return (
    <SettingsGroup
      id="dbExplorer"
      title="Database"
      description="Browse the local SQLite file. Development builds only."
    >
      <DbExplorer />
    </SettingsGroup>
  );
}
