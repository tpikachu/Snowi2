// @ts-check
/* global document, window, requestAnimationFrame -- browser globals used inside page.evaluate callbacks */
/**
 * Records the product demo video by driving the real app.
 *
 * Launches Snowy exactly the way the E2E harness does — dev renderer, a
 * throwaway userData directory — seeds a handful of believable meeting notes
 * through the app's own IPC, and walks the features chapter by chapter:
 * onboarding, Home, search, the note view, Settings. A fake cursor and a
 * caption bar are injected into the page so the viewer can follow along;
 * every chapter is best-effort, so a changed selector skips that chapter
 * instead of killing the recording.
 *
 * Capture is a timestamped screenshot stream assembled by the bundled
 * ffmpeg, NOT Playwright's recordVideo: the screencast recorder cannot
 * attach to Snowy's windows (the first loadURL dies with ERR_FAILED), while
 * page.screenshot works everywhere Playwright can drive.
 *
 * Usage:  npm run demo:video
 * Output: demo-output/snowy-demo.mp4
 *
 * The Vite dev renderer must be reachable on :5183; the script starts
 * `npm run dev:renderer` itself when it is not, and stops it afterwards.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { _electron: electron } = require("@playwright/test");

const PROJECT_ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(PROJECT_ROOT, "demo-output");
const RAW_DIR = path.join(OUT_DIR, "raw");
const DEV_SERVER_URL = "http://localhost:5183";
const SIZE = { width: 1280, height: 800 };

/** Base pacing unit. Raise it for a slower, more contemplative video. */
const BEAT_MS = 1400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Dev server
// ---------------------------------------------------------------------------

function probeDevServer() {
  return new Promise((resolve) => {
    const req = http.get(DEV_SERVER_URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureDevServer() {
  if (await probeDevServer()) return null;
  console.log("dev renderer not running — starting npm run dev:renderer …");
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:renderer"], {
    cwd: PROJECT_ROOT,
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await probeDevServer()) return child;
    await sleep(1000);
  }
  child.kill();
  throw new Error("Vite dev server never became reachable on :5183");
}

// ---------------------------------------------------------------------------
// On-screen demo chrome: caption bar + visible cursor
// ---------------------------------------------------------------------------

async function injectDemoChrome(page) {
  await page.evaluate(() => {
    if (document.getElementById("__demo-cursor")) return;

    const cursor = document.createElement("div");
    cursor.id = "__demo-cursor";
    cursor.style.cssText = [
      "position:fixed;left:0;top:0;width:18px;height:18px;border-radius:50%",
      "background:rgba(2,198,207,.28);border:2px solid rgba(2,198,207,.95)",
      "box-shadow:0 0 10px rgba(2,198,207,.5);pointer-events:none;z-index:2147483647",
      "transform:translate(-50%,-50%);transition:opacity .2s",
      "opacity:0",
    ].join(";");
    document.body.appendChild(cursor);

    const caption = document.createElement("div");
    caption.id = "__demo-caption";
    caption.style.cssText = [
      "position:fixed;left:50%;bottom:28px;transform:translateX(-50%)",
      "max-width:70%;padding:10px 22px;border-radius:999px",
      "background:rgba(10,14,16,.88);color:#fff;font:600 15px system-ui",
      "letter-spacing:.01em;pointer-events:none;z-index:2147483647",
      "opacity:0;transition:opacity .35s;white-space:nowrap",
      "box-shadow:0 8px 30px rgba(0,0,0,.35)",
    ].join(";");
    document.body.appendChild(caption);

    window.addEventListener(
      "mousemove",
      (event) => {
        cursor.style.opacity = "1";
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      },
      true
    );
    window.addEventListener(
      "mousedown",
      (event) => {
        const ripple = document.createElement("div");
        ripple.style.cssText = [
          "position:fixed;border-radius:50%;pointer-events:none;z-index:2147483646",
          "border:2px solid rgba(2,198,207,.8);transform:translate(-50%,-50%)",
          `left:${event.clientX}px;top:${event.clientY}px;width:18px;height:18px`,
          "transition:width .45s ease-out,height .45s ease-out,opacity .45s ease-out",
          "opacity:1",
        ].join(";");
        document.body.appendChild(ripple);
        requestAnimationFrame(() => {
          ripple.style.width = "56px";
          ripple.style.height = "56px";
          ripple.style.opacity = "0";
        });
        setTimeout(() => ripple.remove(), 600);
      },
      true
    );
  });
}

async function caption(page, text) {
  await page.evaluate((value) => {
    const el = document.getElementById("__demo-caption");
    if (!el) return;
    if (!value) {
      el.style.opacity = "0";
      return;
    }
    el.textContent = value;
    el.style.opacity = "1";
  }, text);
  if (text) await sleep(900);
}

/** Glides the mouse to the locator, then clicks — the injected cursor follows. */
async function moveClick(page, locator, { timeout = 8000 } = {}) {
  await locator.first().waitFor({ state: "visible", timeout });
  const box = await locator.first().boundingBox();
  if (!box) throw new Error("target has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
  await sleep(350);
  await locator.first().click();
}

/** A chapter that fails skips itself; the recording keeps going. */
async function chapter(name, fn) {
  try {
    await fn();
    console.log(`  ✔ ${name}`);
  } catch (error) {
    console.warn(`  ⚠ ${name} skipped: ${error?.message ?? error}`);
  }
}

// ---------------------------------------------------------------------------
// Frame capture: serial screenshots with real timestamps, stitched by ffmpeg
// ---------------------------------------------------------------------------

function startFrameCapture(getPage) {
  const frames = []; // { file, at }
  let running = true;
  let index = 0;

  const loop = (async () => {
    while (running) {
      const page = getPage();
      if (!page || page.isClosed()) {
        await sleep(120);
        continue;
      }
      try {
        const at = Date.now();
        const buffer = await page.screenshot({ type: "jpeg", quality: 82 });
        const file = path.join(RAW_DIR, `f${String(index++).padStart(5, "0")}.jpg`);
        fs.writeFileSync(file, buffer);
        frames.push({ file, at });
      } catch {
        // A screenshot can fail across a reload; the next one catches up.
        await sleep(120);
      }
    }
  })();

  return {
    async stop() {
      running = false;
      await loop;
      return frames;
    },
  };
}

function assembleVideo(frames) {
  if (frames.length < 2) {
    console.warn("not enough frames captured to build a video");
    return;
  }
  // The concat demuxer with per-frame durations reproduces real time even
  // though screenshot pacing is uneven.
  const listPath = path.join(RAW_DIR, "frames.txt");
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const durationMs =
      i + 1 < frames.length ? frames[i + 1].at - frames[i].at : frames[i].at - frames[i - 1].at;
    lines.push(`file '${path.basename(frames[i].file)}'`);
    lines.push(`duration ${Math.max(0.02, durationMs / 1000).toFixed(3)}`);
  }
  lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
  fs.writeFileSync(listPath, lines.join("\n"));

  const ffmpeg = require("ffmpeg-static");
  const outPath = path.join(OUT_DIR, "snowy-demo.mp4");
  const result = spawnSync(
    ffmpeg,
    // Scaled to even dimensions for libx264; fps normalized for players.
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-vf",
      "scale=1280:-2,fps=24",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "20",
      outPath,
    ],
    { cwd: RAW_DIR, stdio: "ignore" }
  );
  if (result.status === 0) console.log(`\nvideo: ${outPath}`);
  else console.warn("ffmpeg failed to assemble the video; frames remain in demo-output/raw");
}

// ---------------------------------------------------------------------------
// Demo data, written through the app's own IPC
// ---------------------------------------------------------------------------

const DEMO_NOTES = [
  {
    title: "Acme kickoff",
    participants: [
      { displayName: "Ana Torres", email: "ana@acme.example" },
      { displayName: "Ben Wright", email: "ben@acme.example" },
    ],
    transcript:
      "You: Thanks for making time — the goal today is to agree on the rollout scope.\n" +
      "Them: We want the pilot limited to the Austin team first.\n" +
      "You: That works. We can have onboarding materials ready by Friday.\n" +
      "Them: Perfect. Pricing needs sign-off from Dana before we commit to the annual plan.\n" +
      "You: Understood — I'll send the proposal today so she has the numbers.",
    enhanced:
      "A kickoff with Acme to scope the pilot rollout.\n\n" +
      "## Key Discussion Points\n" +
      "- Pilot limited to the Austin team before a wider rollout\n" +
      "- Annual plan pricing requires Dana's sign-off\n\n" +
      "## Decisions Made\n" +
      "- Start with the Austin pilot; revisit scope after two weeks\n\n" +
      "## Action Items\n" +
      "- [ ] You: send the pricing proposal to Dana today\n" +
      "- [ ] You: onboarding materials ready by Friday\n" +
      "- [ ] Them: confirm pilot participants list",
  },
  {
    title: "Weekly product sync",
    participants: [{ displayName: "Jordan Lee", email: "jordan@snowball.example" }],
    transcript:
      "You: Search quality is the top theme from feedback this week.\n" +
      "Them: Agreed — the semantic ranking change should ship behind a flag first.\n" +
      "You: I'll have the flag in by Wednesday and we review metrics Friday.",
    enhanced:
      "Weekly sync focused on search quality.\n\n" +
      "## Key Discussion Points\n" +
      "- Semantic ranking improvements ship behind a flag\n\n" +
      "## Action Items\n" +
      "- [ ] You: land the feature flag by Wednesday\n" +
      "- [ ] Both: review search metrics on Friday",
  },
  {
    title: "1:1 with Jordan",
    participants: [{ displayName: "Jordan Lee", email: "jordan@snowball.example" }],
    transcript:
      "You: How is the migration project going?\n" +
      "Them: On track — the last two services move next sprint.\n" +
      "You: Great. Let's talk about the conference talk you wanted to propose.",
    enhanced:
      "Regular 1:1.\n\n" +
      "## Topics Discussed\n" +
      "- Service migration on track; final two services next sprint\n" +
      "- Jordan wants to propose a conference talk\n\n" +
      "## Action Items\n" +
      "- [ ] You: review Jordan's talk abstract by Monday",
  },
];

async function seedDemoNotes(page) {
  await page.evaluate(async (notes) => {
    for (const note of notes) {
      const saved = await window.electronAPI.saveNote(note.title, "", "meeting");
      if (!saved?.success || !saved.note) continue;
      await window.electronAPI.updateNote(saved.note.id, {
        transcript: note.transcript,
        enhanced_content: note.enhanced,
        participants: JSON.stringify(note.participants),
      });
    }
  }, DEMO_NOTES);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  fs.rmSync(RAW_DIR, { recursive: true, force: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const userDataDir = path.join(OUT_DIR, "user-data");
  fs.rmSync(userDataDir, { recursive: true, force: true });

  const devServer = await ensureDevServer();

  const env = {
    ...process.env,
    NODE_ENV: "development",
    SNOWY_CHANNEL: "development",
    SNOWY_USER_DATA_DIR: userDataDir,
    // Playwright's recordVideo cannot attach to a sandboxed renderer — the
    // first loadURL dies with ERR_FAILED. Dev-only seam in windowConfig.js.
    SNOWY_DISABLE_RENDERER_SANDBOX: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  console.log("launching Snowy …");
  const app = await electron.launch({
    executablePath: require("electron"),
    // Chromium flags must precede the app path. Vite binds 127.0.0.1 only,
    // and a proxied or IPv6-first environment turns that into ERR_FAILED on
    // loadURL while plain Node reaches the server fine — pin both down.
    args: ["--host-resolver-rules=MAP localhost 127.0.0.1", "--no-proxy-server", PROJECT_ROOT],
    cwd: PROJECT_ROOT,
    env,
  });

  // The main process narrates its own boot problems; keep that narration.
  const mainLog = fs.createWriteStream(path.join(OUT_DIR, "main.log"));
  app.process().stdout?.pipe(mainLog);
  app.process().stderr?.pipe(mainLog);

  let page;
  let capture = null;
  try {
    // Find the control panel window (the overlay window is the plain URL).
    const deadline = Date.now() + 60_000;
    for (;;) {
      page = app.windows().find((candidate) => candidate.url().includes("panel=true"));
      if (page) break;
      if (Date.now() > deadline) {
        const urls = app.windows().map((candidate) => candidate.url());
        throw new Error(
          `control panel window never appeared. Windows: ${JSON.stringify(urls)} — see demo-output/main.log`
        );
      }
      await sleep(250);
    }
    await page.waitForLoadState("domcontentloaded");

    const bw = await app.browserWindow(page);
    await bw.evaluate((win, size) => {
      win.setBounds({ width: size.width, height: size.height });
      win.center();
      win.focus();
    }, SIZE);

    await injectDemoChrome(page);
    capture = startFrameCapture(() => page);
    await sleep(1500);

    // -- Chapter 1: onboarding -------------------------------------------
    await chapter("onboarding", async () => {
      await caption(page, "Setup asks plain questions — no technical terms");
      await moveClick(page, page.getByText(/team meetings/i), { timeout: 10_000 });
      await sleep(BEAT_MS);
      await moveClick(page, page.getByRole("button", { name: /next|continue/i }));
      await sleep(BEAT_MS);

      await caption(page, "Private on your computer, or an online service — your call");
      await moveClick(page, page.getByText(/private, on this computer|on this computer/i), {
        timeout: 10_000,
      });
      await sleep(BEAT_MS);

      await caption(page, "Snowy can pick and download the right model for this machine");
      await moveClick(page, page.getByText(/choose myself/i), { timeout: 10_000 });
      await sleep(BEAT_MS * 1.5);
      await caption(page, "");
    });

    // Seed the library, then jump past the rest of onboarding.
    await seedDemoNotes(page);
    await page.evaluate(() => {
      localStorage.setItem("onboardingCompleted", "true");
      localStorage.setItem("tourCompletedVersion", "999");
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await injectDemoChrome(page);
    await sleep(2000);

    // -- Chapter 2: Home -------------------------------------------------
    await chapter("home", async () => {
      await caption(page, "Home is your meeting log — one button starts a meeting");
      const start = page.getByRole("button", { name: /start meeting/i }).first();
      await start.waitFor({ state: "visible", timeout: 15_000 });
      const box = await start.boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
      await sleep(BEAT_MS * 1.5);
    });

    // -- Chapter 3: search everywhere ------------------------------------
    await chapter("search", async () => {
      await caption(page, "Search lives in the header — every screen, ⌘K / Ctrl K");
      await moveClick(page, page.locator('[data-tour="nav-search"]'));
      await sleep(600);
      await page.keyboard.type("kickoff", { delay: 120 });
      await sleep(BEAT_MS * 1.5);
      await page.keyboard.press("Escape");
      await caption(page, "");
    });

    // -- Chapter 4: the note view ----------------------------------------
    await chapter("note view", async () => {
      await moveClick(page, page.locator('[data-tour="nav-notes"]'));
      await sleep(BEAT_MS);
      await caption(page, "A meeting opens on its Summary — the page it exists to produce");
      await moveClick(page, page.getByText("Acme kickoff").first());
      await sleep(BEAT_MS * 1.5);

      await moveClick(page, page.locator('[data-segment-value="transcript"]'));
      await caption(page, "The full transcript sits one tab away");
      await sleep(BEAT_MS);
      await moveClick(page, page.locator('[data-segment-value="enhanced"]'));
      await sleep(600);

      await caption(page, "Copy the summary, or draft the follow-up email");
      await moveClick(page, page.getByRole("button", { name: /copy summary/i }));
      await sleep(BEAT_MS);
      await moveClick(page, page.getByRole("button", { name: /follow-up email/i }));
      await sleep(BEAT_MS * 2);
      await page.keyboard.press("Escape");
      await caption(page, "");
      await sleep(400);
    });

    // -- Chapter 5: Settings is a modal ----------------------------------
    await chapter("settings", async () => {
      await caption(page, "Settings opens as a modal — Esc or click outside to leave");
      await moveClick(page, page.locator('[data-tour="nav-settings"]'));
      await sleep(BEAT_MS * 2);
      await page.keyboard.press("Escape");
      await sleep(600);
      await caption(page, "");
    });

    // -- Chapter 6: chat with your notes ---------------------------------
    await chapter("chat", async () => {
      await caption(page, "Ask the assistant anything across all your meetings");
      await moveClick(page, page.getByRole("button", { name: "Chat", exact: true }));
      await sleep(BEAT_MS * 1.5);
      await caption(page, "");
    });

    // -- Finale ----------------------------------------------------------
    await chapter("finale", async () => {
      await moveClick(page, page.getByRole("button", { name: "Home", exact: true }));
      await caption(page, "Snowy — your meetings, remembered");
      await sleep(BEAT_MS * 2);
    });
  } finally {
    const frames = capture ? await capture.stop() : [];
    await app.close().catch(() => {});
    assembleVideo(frames);
    if (devServer) devServer.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
