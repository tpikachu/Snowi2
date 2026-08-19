const path = require("path");
const fs = require("fs");
const os = require("os");

// Clean build directories
console.log("🧹 Cleaning build directories...");
const dirsToClean = ["dist/", "src/dist/", "node_modules/.cache/"];

dirsToClean.forEach((dir) => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`✅ Cleaned: ${dir}`);
  } else {
    console.log(`ℹ️ Directory not found: ${dir}`);
  }
});

// Clean development database
console.log("🗄️ Cleaning development database...");
try {
  // Mirror the app's userData resolution: base dir is "Snowy", and non-production
  // channels are isolated into "Snowy-{channel}" (development runs use "Snowy-development").
  const appDataRoot =
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : process.platform === "win32"
        ? process.env.APPDATA || os.homedir()
        : path.join(os.homedir(), ".config");

  const userDataDirs = ["Snowy", "Snowy-development"].map((dir) => path.join(appDataRoot, dir));

  let cleanedAny = false;
  for (const userDataPath of userDataDirs) {
    const devDbPath = path.join(userDataPath, "transcriptions-dev.db");
    if (fs.existsSync(devDbPath)) {
      fs.unlinkSync(devDbPath);
      cleanedAny = true;
      console.log(`✅ Development database cleaned: ${devDbPath}`);
    }
  }
  if (!cleanedAny) {
    console.log("ℹ️ No development database found to clean");
  }
} catch (error) {
  console.error("❌ Error cleaning database files:", error.message);
}

console.log("✨ Cleanup completed successfully!");
