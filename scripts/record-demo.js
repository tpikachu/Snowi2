// @ts-check
/* global document, window, requestAnimationFrame -- browser globals used inside page.evaluate callbacks */
/**
 * Records the product demo video by driving the real app.
 *
 * Launches Snowy exactly the way the E2E harness does — dev renderer, a
 * throwaway userData directory — and tells the whole story a new,
 * non-technical user lives through: every onboarding step at a human pace,
 * the one-time OpenAI key setup (a placeholder is typed on camera; the real
 * key from .env.local is saved silently and never filmed — and entering the
 * key IS the whole AI setup: the app picks each feature's model itself),
 * then an actual recorded call: a scripted two-voice meeting is synthesized
 * with Windows TTS and fed to the app as its microphone (Chromium's fake
 * audio capture), so the live transcript, the AI-written summary, and the
 * chat answer in the video are all real.
 * A fake cursor and a two-line caption card are injected so the viewer can
 * follow along; every chapter is best-effort, so a changed selector skips
 * that chapter instead of killing the recording.
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
// Real AI: the OpenAI key from .env.local / .env
// ---------------------------------------------------------------------------

/**
 * The demo configures a real OpenAI key (read at runtime, never stored in
 * this script and never visible in the video — the key field is masked) so
 * transcription, the meeting summary, and chat all genuinely work on camera.
 */
function readOpenAIKey() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(PROJECT_ROOT, name);
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, "utf8").match(/^OPENAI_API_KEY=(.+)$/m);
    const value = match?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  return process.env.OPENAI_API_KEY || "";
}

// ---------------------------------------------------------------------------
// The demo call: a short scripted meeting synthesized with Windows TTS and
// fed to the app as its microphone (Chromium's fake audio capture device)
// ---------------------------------------------------------------------------

const CALL_LINES = [
  [
    "Microsoft David Desktop",
    "Hi Priya, thanks for joining. Today I want to walk you through the rollout plan for your team.",
  ],
  [
    "Microsoft Zira Desktop",
    "Sounds good. Our main concern is getting the sales team on board without slowing them down.",
  ],
  [
    "Microsoft David Desktop",
    "Understood. We suggest starting with a two week pilot for just the Austin office.",
  ],
  [
    "Microsoft Zira Desktop",
    "That works for us. Can you have the training materials ready by next Friday?",
  ],
  ["Microsoft David Desktop", "Yes, I will send the training guide and a short video by Friday."],
  [
    "Microsoft Zira Desktop",
    "Great. One more thing. Our director Dana needs to approve the annual pricing before we sign.",
  ],
  ["Microsoft David Desktop", "No problem. I will email the full pricing proposal to Dana today."],
  [
    "Microsoft Zira Desktop",
    "Perfect. Let us meet again in two weeks to review how the pilot is going.",
  ],
  [
    "Microsoft David Desktop",
    "Agreed. Let me quickly recap. We start a two week pilot in Austin, and I send the training guide and video by Friday.",
  ],
  [
    "Microsoft Zira Desktop",
    "Right. And the pricing proposal goes to Dana today so she can review it before we sign.",
  ],
  ["Microsoft David Desktop", "Exactly. How many people should we plan for in the pilot?"],
  [
    "Microsoft Zira Desktop",
    "About twenty five people from the Austin sales team. I will send you the list tomorrow.",
  ],
  [
    "Microsoft David Desktop",
    "Great, twenty five seats it is. I will set up their accounts as soon as I get the list.",
  ],
  [
    "Microsoft Zira Desktop",
    "One question. Can our team keep using their current tools during the pilot?",
  ],
  [
    "Microsoft David Desktop",
    "Yes, nothing changes in their workflow. Snowy runs quietly alongside the tools they already use.",
  ],
  ["Microsoft Zira Desktop", "That is exactly what I hoped. Alright, I think we have a plan."],
  [
    "Microsoft David Desktop",
    "Wonderful. I will send the calendar invite for the two week review. Have a great day, Priya!",
  ],
];

/**
 * Synthesizes the call as TWO aligned WAVs, the way a real meeting sounds:
 * your side (David) goes to the fake microphone; the customer's side (Zira)
 * is played through the actual speakers during the call, where Snowy's
 * system-audio loopback hears it — giving the transcript genuine You/Them
 * speaker separation with real speech on both channels. Each file carries
 * exact measured silence while the other side talks, so the turns line up.
 *
 * Returns { micWav, sysWav } or null (non-Windows, or synthesis failed).
 */
function ensureDemoCallWavs() {
  if (process.platform !== "win32") return null;
  // The line count in the names busts the cache when the script changes.
  const micWav = path.join(OUT_DIR, `demo-call-mic-${CALL_LINES.length}.wav`);
  const sysWav = path.join(OUT_DIR, `demo-call-sys-${CALL_LINES.length}.wav`);
  const fresh = (file) => fs.existsSync(file) && fs.statSync(file).size > 100_000;
  if (fresh(micWav) && fresh(sysWav)) return { micWav, sysWav };

  const psLines = CALL_LINES.map(
    ([voice, line]) => `@('${voice.replace(/'/g, "''")}', '${line.replace(/'/g, "''")}')`
  ).join(",\n  ");
  const script = `
Add-Type -AssemblyName System.Speech
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$lines = @(
  ${psLines}
)

# Pass 1: measure each spoken line (bytes / 32 = milliseconds at 16 kHz mono 16-bit).
$tmp = Join-Path $env:TEMP 'snowy-demo-measure.wav'
$durs = @()
foreach ($l in $lines) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice($l[0])
  $s.SetOutputToWaveFile($tmp, $fmt)
  $s.Speak($l[1])
  $s.Dispose()
  $durs += [int][math]::Ceiling(((Get-Item $tmp).Length - 44) / 32.0)
}
Remove-Item $tmp -ErrorAction SilentlyContinue

# Pass 2: one file per side; the other side's turns become exact silence.
function Build([string]$outPath, [string]$speakVoice) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SetOutputToWaveFile($outPath, $fmt)
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i][0] -eq $speakVoice) {
      $s.SelectVoice($speakVoice)
      $s.Speak($lines[$i][1])
    } else {
      $pb = New-Object System.Speech.Synthesis.PromptBuilder
      $pb.AppendBreak([TimeSpan]::FromMilliseconds($durs[$i]))
      $s.Speak($pb)
    }
    $gap = New-Object System.Speech.Synthesis.PromptBuilder
    $gap.AppendBreak([TimeSpan]::FromMilliseconds(350))
    $s.Speak($gap)
  }
  $s.SetOutputToDefaultAudioDevice()
  $s.Dispose()
}
Build '${micWav.replace(/'/g, "''")}' 'Microsoft David Desktop'
Build '${sysWav.replace(/'/g, "''")}' 'Microsoft Zira Desktop'
`;
  const psPath = path.join(OUT_DIR, "make-demo-call.ps1");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(psPath, script);
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psPath],
    {
      stdio: "ignore",
    }
  );
  if (result.status === 0 && fresh(micWav) && fresh(sysWav)) return { micWav, sysWav };
  console.warn("could not synthesize the demo call audio — the live call chapter will be skipped");
  return null;
}

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
  killTree(child);
  throw new Error("Vite dev server never became reachable on :5183");
}

/**
 * On Windows, child.kill() only reaches the npm shell wrapper and leaves the
 * node/Vite process underneath alive — holding :5183 hostage for the next
 * `npm run dev`. taskkill /T takes the whole tree down.
 */
function killTree(child) {
  if (!child) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill();
  }
}

// ---------------------------------------------------------------------------
// On-screen demo chrome: caption bar + visible cursor
// ---------------------------------------------------------------------------

async function injectDemoChrome(page, { captionAtTop = false } = {}) {
  await page.evaluate((atTop) => {
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

    // Caption card: a headline plus an optional smaller explainer line, so the
    // video can talk to non-technical viewers in full sentences.
    const caption = document.createElement("div");
    caption.id = "__demo-caption";
    caption.style.cssText = [
      // In the small cue-card window the caption sits at the top, clear of
      // the ask box at the panel's bottom edge.
      `position:fixed;left:50%;${atTop ? "top" : "bottom"}:26px;transform:translateX(-50%)`,
      "max-width:76%;padding:12px 26px;border-radius:18px;text-align:center",
      "background:rgba(10,14,16,.9);color:#fff;font:600 16px/1.35 system-ui",
      "letter-spacing:.01em;pointer-events:none;z-index:2147483647",
      "opacity:0;transition:opacity .35s",
      "box-shadow:0 8px 30px rgba(0,0,0,.35)",
    ].join(";");
    const captionTitle = document.createElement("div");
    captionTitle.id = "__demo-caption-title";
    const captionDetail = document.createElement("div");
    captionDetail.id = "__demo-caption-detail";
    captionDetail.style.cssText =
      "font:400 13.5px/1.4 system-ui;color:rgba(255,255,255,.78);margin-top:3px";
    caption.appendChild(captionTitle);
    caption.appendChild(captionDetail);
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
  }, captionAtTop);
}

/**
 * Shows a caption: a headline and an optional smaller explainer line.
 * The hold time scales with how much there is to read, so a viewer who has
 * never seen the product can actually finish the sentence.
 */
async function caption(page, text, detail = "") {
  await page.evaluate(
    ({ value, extra }) => {
      const el = document.getElementById("__demo-caption");
      const title = document.getElementById("__demo-caption-title");
      const body = document.getElementById("__demo-caption-detail");
      if (!el || !title || !body) return;
      if (!value) {
        el.style.opacity = "0";
        return;
      }
      title.textContent = value;
      body.textContent = extra;
      body.style.display = extra ? "block" : "none";
      el.style.opacity = "1";
    },
    { value: text, extra: detail }
  );
  if (text) await sleep(Math.max(1100, (text.length + detail.length) * 45));
}

/** Glides the mouse to the locator without clicking — for pointing at things. */
async function moveTo(page, locator, { timeout = 8000 } = {}) {
  await locator.first().waitFor({ state: "visible", timeout });
  const box = await locator.first().boundingBox();
  if (!box) throw new Error("target has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
  await sleep(350);
}

/** Glides the mouse to the locator, then clicks — the injected cursor follows. */
async function moveClick(page, locator, { timeout = 8000 } = {}) {
  await moveTo(page, locator, { timeout });
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

function startFrameCapture(getTarget) {
  const frames = []; // { file, at }
  let running = true;
  let index = 0;

  const loop = (async () => {
    while (running) {
      const target = getTarget();
      const page = target?.page ?? null;
      if (!page || page.isClosed()) {
        await sleep(120);
        continue;
      }
      try {
        const at = Date.now();
        const buffer = await page.screenshot({
          type: "jpeg",
          quality: 82,
          ...(target.clip ? { clip: target.clip } : {}),
        });
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
      // Letterbox every frame onto one canvas: the cue-card window is much
      // smaller than the main window, and libx264 needs a constant size.
      "-vf",
      "scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2:color=0x0d1214,fps=24",
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
  // maxRetries rides out transient Windows locks (an antivirus sweep, an
  // Explorer window, a shell parked inside the directory).
  fs.rmSync(RAW_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const userDataDir = path.join(OUT_DIR, "user-data");
  fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });

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

  // The scripted meeting audio: your side feeds the fake microphone, the
  // customer's side is played through the speakers during the call.
  const call = ensureDemoCallWavs();

  const OPENAI_KEY = readOpenAIKey();
  if (!OPENAI_KEY) {
    console.warn(
      "no OPENAI_API_KEY found in .env.local/.env — transcription, the summary and chat will show their empty states"
    );
  }

  console.log("launching Snowy …");
  const app = await electron.launch({
    executablePath: require("electron"),
    // Chromium flags must precede the app path. Vite binds 127.0.0.1 only,
    // and a proxied or IPv6-first environment turns that into ERR_FAILED on
    // loadURL while plain Node reaches the server fine — pin both down.
    // The fake-device flags replace the real microphone with the synthesized
    // demo call, so the live call chapter records deterministic audio.
    args: [
      "--host-resolver-rules=MAP localhost 127.0.0.1",
      "--no-proxy-server",
      ...(call
        ? [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-audio-capture=${call.micWav}`,
          ]
        : []),
      PROJECT_ROOT,
    ],
    cwd: PROJECT_ROOT,
    env,
  });

  // The main process narrates its own boot problems; keep that narration.
  const mainLog = fs.createWriteStream(path.join(OUT_DIR, "main.log"));
  app.process().stdout?.pipe(mainLog);
  app.process().stderr?.pipe(mainLog);

  let page;
  let capture = null;
  let sysPlayer = null;
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
    // The capture target is switchable so the video can cut to the cue-card
    // window mid-call and back; a clip crops the small card to its content.
    let capturePage = page;
    let captureClip = null;
    capture = startFrameCapture(() => ({ page: capturePage, clip: captureClip }));
    await sleep(1500);

    // -- Act 1: onboarding, every step, at a human pace -------------------
    await chapter("welcome", async () => {
      await caption(
        page,
        "Welcome to Snowy",
        "Your private meeting note-taker. Let's set it up together — it takes about a minute."
      );
      await sleep(BEAT_MS);
    });

    await chapter("onboarding: about you", async () => {
      await caption(
        page,
        "First, tell Snowy what you use it for",
        "Pick anything that fits — this simply tunes how your notes are written."
      );
      await moveClick(page, page.getByText(/team meetings/i), { timeout: 15_000 });
      await sleep(600);
      await moveClick(page, page.getByText(/client & sales calls/i));
      await sleep(BEAT_MS);
      await moveClick(page, page.getByRole("button", { name: "Next", exact: true }));
      await sleep(BEAT_MS);
    });

    await chapter("onboarding: transcription", async () => {
      await caption(
        page,
        "Choose how your speech becomes text",
        "Keep everything on this computer, or use an online service — we'll go online for the best accuracy."
      );
      await moveClick(page, page.getByText(/^Online service$/), { timeout: 10_000 });
      await sleep(BEAT_MS);

      await caption(
        page,
        "OpenAI is recommended and already selected",
        "Just paste the key from your OpenAI account — the link below takes you right to it."
      );
      // A placeholder key is typed for the camera; the real key from
      // .env.local is saved silently afterwards, so it never appears on film.
      // Typing it through the real field matters beyond the camera: the key
      // setter is what assigns each feature its default model
      // (scopeModelDefaults.ts), so this one paste is the entire AI setup.
      await moveClick(page, page.getByRole("button", { name: "Add API key" }));
      await sleep(400);
      await page.keyboard.type("sk-proj-demo-key-for-this-video", { delay: 55 });
      await sleep(500);
      await page.keyboard.press("Enter");
      await caption(
        page,
        "That's the only technical step — and you only do it once",
        "The same key also powers the AI that writes your notes. Snowy picks the models for you."
      );
      await sleep(600);
      await moveClick(page, page.getByRole("button", { name: "Next", exact: true }));
      await sleep(BEAT_MS);
    });

    // The real key, silently, once the key field's debounced save has flushed.
    if (OPENAI_KEY) {
      await sleep(1500);
      await page.evaluate(async (key) => {
        await window.electronAPI?.saveOpenAIKey?.(key);
      }, OPENAI_KEY);
    }

    await chapter("onboarding: permissions", async () => {
      await caption(
        page,
        "Allow the microphone",
        "Snowy only listens during a meeting you started — never in the background."
      );
      await moveClick(page, page.getByRole("button", { name: /grant access/i }), {
        timeout: 10_000,
      });
      await sleep(BEAT_MS);
      await moveClick(page, page.getByRole("button", { name: "Next", exact: true }));
      await sleep(BEAT_MS);
    });

    await chapter("onboarding: text size", async () => {
      await caption(
        page,
        "Make it comfortable to read",
        "Try a text size — the window resizes the moment you click."
      );
      // The size cards are a radiogroup; the whole onboarding window zooms
      // live on selection, which is the point of filming this step.
      await moveClick(page, page.getByRole("radio", { name: /larger/i }), { timeout: 10_000 });
      await sleep(BEAT_MS);
      await moveClick(page, page.getByRole("radio", { name: /default/i }));
      await sleep(600);
      await moveClick(page, page.getByRole("button", { name: "Next", exact: true }));
      await sleep(BEAT_MS);
    });

    // Skip the first-run product tour so the video moves straight to the app.
    await page.evaluate(() => {
      localStorage.setItem("tourCompletedVersion", "999");
    });

    await chapter("onboarding: finish", async () => {
      await caption(page, "And that's the whole setup", "Snowy is ready for your first meeting.");
      await moveClick(page, page.getByRole("button", { name: /skip for now/i }), {
        timeout: 10_000,
      });
      await sleep(BEAT_MS);
    });

    // A few believable past meetings, so search and chat have history.
    await seedDemoNotes(page);

    // -- Act 1.5: meet the assistant bar -----------------------------------
    // Finishing onboarding is the edge that makes the bar debut: from now on
    // it sits on top of the screen at every login, and it is where daily use
    // happens. Filmed in its own window, padded taller with a letterbox-dark
    // backdrop so the caption has somewhere to live under the 56px row.
    let barPage = null;
    for (let i = 0; i < 20 && !barPage; i++) {
      barPage = app.windows().find((candidate) => candidate.url().includes("agent=true")) ?? null;
      if (!barPage) await sleep(300);
    }
    const barBw = barPage ? await app.browserWindow(barPage) : null;
    const frameBar = async () => {
      await barBw.evaluate((win) => {
        const bounds = win.getBounds();
        win.setBounds({ ...bounds, width: 560, height: 250 });
      });
      await barPage.evaluate(() => {
        if (document.getElementById("__demo-bar-style")) return;
        const style = document.createElement("style");
        style.id = "__demo-bar-style";
        // Paint the window's padding the letterbox colour so the strip under
        // the bar carries the caption. The bar card itself is already a fixed
        // 104px (BAR_HEIGHT in AgentOverlay), so no height pinning is needed —
        // pinning it would fight the glass card's own layout.
        style.textContent = ".agent-overlay-window { background: #0d1214 !important; }";
        document.head.appendChild(style);
      });
    };
    // Must run before the bar morphs into the cue card — the pinned 56px
    // would otherwise squash the card too.
    const unframeBar = async () => {
      await barPage.evaluate(() => document.getElementById("__demo-bar-style")?.remove());
    };

    if (barPage) {
      await injectDemoChrome(barPage);
      await chapter("meet the bar", async () => {
        await frameBar();
        capturePage = barPage;
        captureClip = null;
        await caption(
          barPage,
          "Meet the assistant bar",
          "The moment setup ends, this little bar appears — and it stays on top of your screen, ready at every login."
        );
        await sleep(BEAT_MS * 1.5);
        // No amber warning to point at: the key entered during onboarding
        // already configured transcription AND the AI models, so the bar has
        // nothing to complain about — which is itself the story.
        await caption(
          barPage,
          "And there's nothing left to configure",
          "The key you pasted a minute ago also chose the AI that writes your notes. Snowy handled the rest."
        );
        await sleep(BEAT_MS * 1.5);
        await caption(barPage, "");
        capturePage = page;
      });
    }

    // -- Act 2: the setup card agrees ---------------------------------------
    await chapter("everything ready", async () => {
      // Home's capabilities card shows both rows — transcription and the AI
      // model — already green. No clicks; the point is that there is nothing
      // to click.
      await page
        .getByText("What Snowy can do right now")
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      await caption(
        page,
        "See for yourself — both lights are green",
        "Speech-to-text and the AI writer are ready. You never picked a model, and you never have to."
      );
      await sleep(BEAT_MS * 2);
      await caption(page, "");
    });

    // Belt and braces: summaries and chat must run on OpenAI even if the
    // settings chapter mis-clicked; the reload also makes the renderer
    // re-read the real key from the main process.
    await page.evaluate(() => {
      localStorage.setItem("actionsMode", "providers");
      localStorage.setItem("actionsProvider", "openai");
      localStorage.setItem("actionsModel", "gpt-5-mini");
      localStorage.setItem("chatAgentMode", "providers");
      localStorage.setItem("chatAgentProvider", "openai");
      localStorage.setItem("chatAgentModel", "gpt-5-mini");
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await injectDemoChrome(page);
    await sleep(2000);

    // -- Act 3: the demo call ----------------------------------------------
    await chapter("demo call", async () => {
      if (!call) throw new Error("no demo call audio on this platform");
      if (barPage) {
        // The bar again — this time with nothing left to warn about, and the
        // meeting starts from it, the way daily use actually goes.
        await frameBar();
        capturePage = barPage;
        await caption(
          barPage,
          "Time for a real call",
          "Every meeting starts from the bar — one click, whatever app you're in."
        );
        await sleep(BEAT_MS);
        await unframeBar();
        await moveClick(barPage, barPage.getByRole("button", { name: /start meeting/i }).first(), {
          timeout: 15_000,
        });
        capturePage = page;
        captureClip = null;
      } else {
        await caption(
          page,
          "Now let's record a real call",
          "One click on Start meeting — Snowy handles everything else."
        );
        await moveClick(page, page.getByRole("button", { name: /start meeting/i }).first(), {
          timeout: 15_000,
        });
      }
      await sleep(1500);

      // The customer's side of the call, through the real speakers — the mic
      // stream (and its fake-capture file) starts about now too, so the two
      // sides stay roughly in step; the script's turn gaps absorb the rest.
      sysPlayer = spawn(
        "powershell",
        ["-NoProfile", "-Command", `(New-Object Media.SoundPlayer '${call.sysWav}').PlaySync()`],
        { stdio: "ignore" }
      );

      // Snowy minimizes its window during a meeting to stay out of the way;
      // bring it back so the camera can watch the transcript being written.
      await bw.evaluate((win) => {
        win.restore();
        win.focus();
      });
      await sleep(1500);

      await caption(
        page,
        "Snowy writes the conversation down as it happens",
        "This demo call is between you and a customer, Priya — watch the lines appear."
      );
      await page
        .getByText(/pilot|Austin|training materials/i)
        .first()
        .waitFor({ state: "visible", timeout: 45_000 })
        .catch(() => {});
      await sleep(6000);
      await caption(
        page,
        "Nothing to type, nothing to remember",
        "Just have the conversation — every line is captured for you."
      );
      await sleep(6000);

      // -- The cue card: the bar, morphed ----------------------------------
      // While a meeting records, the assistant bar window IS the cue card —
      // one surface growing in place, no second window to find. Its demo
      // chrome is already injected; framePanel repositions the caption.
      const panelPage = barPage;
      if (panelPage) {
        await sleep(800);

        // Crop the capture to the card's content (the window is taller than
        // the card) and park the caption in the spare strip just below it.
        // Re-run after anything that grows the card.
        const framePanel = async () => {
          const metrics = await panelPage.evaluate(() => {
            // Skip full-height containers (the React root spans the window);
            // the card itself is the tallest element that doesn't.
            let bottom = 0;
            for (const el of document.querySelectorAll("body *")) {
              if (el.id && el.id.startsWith("__demo")) continue;
              if (el.closest("#__demo-caption")) continue;
              const rect = el.getBoundingClientRect();
              if (rect.width < 2 || rect.height < 2) continue;
              if (rect.height >= window.innerHeight * 0.95) continue;
              bottom = Math.max(bottom, Math.min(rect.bottom, window.innerHeight));
            }
            return {
              width: window.innerWidth,
              height: window.innerHeight,
              bottom: Math.ceil(bottom),
            };
          });
          const height = Math.min(metrics.height, metrics.bottom + 100);
          await panelPage.evaluate(
            (top) => {
              const el = document.getElementById("__demo-caption");
              if (el) {
                el.style.bottom = "";
                el.style.top = `${top}px`;
              }
            },
            Math.min(metrics.bottom + 10, height - 90)
          );
          captureClip = { x: 0, y: 0, width: metrics.width, height };
        };
        await framePanel();
        capturePage = panelPage;

        await caption(
          panelPage,
          "The bar just grew into the cue card",
          "It floats above every app during the call — and one switch in Settings keeps it out of screen shares."
        );
        await sleep(2500);

        // The cue card no longer shows a transcript (it lives in the note);
        // the level meter and the suggestion are the live signals on film.
        await sleep(800);
        await framePanel();
        await caption(
          panelPage,
          "The assistant listens along with you",
          "The full transcript lands in the meeting's note — this card stays focused on what to say next."
        );
        await sleep(5000);
        await framePanel();

        await caption(panelPage, "Stuck mid-call? Ask for a suggestion");
        await moveClick(panelPage, panelPage.getByText("What should I say?").first(), {
          timeout: 8000,
        }).catch(() => {});
        await sleep(4000);
        await framePanel();
        await sleep(5000);

        await caption(
          panelPage,
          "Or ask anything about the call so far",
          "The answer comes from this very conversation, in real time."
        );
        await moveClick(panelPage, panelPage.getByLabel("Ask about this meeting").first(), {
          timeout: 8000,
        }).catch(() => {});
        await panelPage.keyboard.type("What do I need to send before Friday?", { delay: 45 });
        await sleep(300);
        await panelPage.keyboard.press("Enter");
        await sleep(4000);
        await framePanel();
        await sleep(8000);
        await caption(panelPage, "");

        // Back to the main window for the rest of the story.
        capturePage = page;
        captureClip = null;
        await bw.evaluate((win) => win.focus());
        await sleep(1000);
      }

      await caption(page, "When the call wraps up, press Stop");
      await moveClick(page, page.locator('button[aria-label="Stop"]').first(), {
        timeout: 10_000,
      });
      await sleep(1200);

      await caption(page, "You stay in charge", "Keep the meeting, or discard it — your call.");
      await moveClick(page, page.getByRole("button", { name: /^Save/ }), { timeout: 10_000 });
      sysPlayer?.kill();
      sysPlayer = null;
    });

    // -- Act 4: the AI write-up --------------------------------------------
    await chapter("summary", async () => {
      await caption(
        page,
        "Snowy is now writing the meeting up for you",
        "A clean summary with every promise pulled out — it takes a few seconds."
      );
      await sleep(3000);
      // The write-up lands on the Summary tab; make sure we are looking at it.
      await moveClick(page, page.locator('[data-segment-value="enhanced"]'), {
        timeout: 10_000,
      }).catch(() => {});
      // The model writes its own headings — match any of the usual ones.
      await page
        .getByText(/action items|decisions|next steps|follow-ups/i)
        .first()
        .waitFor({ state: "visible", timeout: 120_000 });
      await sleep(BEAT_MS * 2);
      await caption(
        page,
        "This summary was written by the AI just now",
        "Everything you told Priya is captured — including what to send Dana."
      );
      await sleep(BEAT_MS * 2);

      await caption(
        page,
        "Need to share it? One click",
        "Copy the recap, or draft the follow-up email."
      );
      await moveClick(page, page.getByRole("button", { name: /copy (recap|summary)/i }));
      await sleep(BEAT_MS);
      await moveClick(page, page.getByRole("button", { name: /follow-up email/i }));
      await sleep(BEAT_MS * 3);
      await page.keyboard.press("Escape");
      await sleep(400);

      // Point at (but don't press) Resume: pressing would start a second
      // recording session against an already-consumed fake-mic file.
      await caption(
        page,
        "And a meeting isn't over unless you say so",
        "Pick this same topic up next week — Resume records another session straight into this note."
      );
      await moveTo(page, page.getByRole("button", { name: /resume meeting/i })).catch(() => {});
      await sleep(BEAT_MS * 1.5);
      await caption(page, "");
    });

    // -- Act 5: ask Snowy ----------------------------------------------------
    // The post-meeting note context hides parts of the shell (and grows its
    // own "Chat" controls), so leave it cleanly: a reload lands on Home with
    // the icon rail up, and the rail buttons are addressed by their tour
    // anchors rather than text that the note view can duplicate.
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await injectDemoChrome(page);
    await sleep(2500);

    await chapter("chat", async () => {
      await caption(
        page,
        "Later, just ask Snowy",
        "It answers from your own meetings — like a colleague with perfect memory."
      );
      await moveClick(page, page.locator('[data-tour="nav-chat"]'));
      await sleep(BEAT_MS);
      await moveClick(page, page.getByRole("button", { name: /new chat/i }).first(), {
        timeout: 6000,
      }).catch(() => {});
      await sleep(800);
      await moveClick(page, page.getByPlaceholder(/type a message/i));
      await page.keyboard.type("What did I promise to send Dana?", { delay: 45 });
      await sleep(400);
      await page.keyboard.press("Enter");
      await caption(page, "Snowy checks your notes and answers");
      await page
        .getByText(/pricing|proposal/i)
        .first()
        .waitFor({ state: "visible", timeout: 45_000 })
        .catch(() => {});
      await sleep(3000);
      await caption(
        page,
        "A real answer, from your real meeting",
        "It even offers to draft the email for you."
      );
      await sleep(5000);

      // The point-of-use model chip: the one place a model is ever chosen.
      await caption(
        page,
        "Prefer a different AI? Change it right here",
        "The choice lives where you use it — never buried in Settings."
      );
      await moveClick(page, page.getByRole("button", { name: "Model", exact: true }).first(), {
        timeout: 8000,
      }).catch(() => {});
      await sleep(BEAT_MS * 1.5);
      await page.keyboard.press("Escape");
      await sleep(400);
      await caption(page, "");
    });

    // -- Act 6: search -------------------------------------------------------
    await chapter("search", async () => {
      await caption(
        page,
        "Everything is searchable, from every screen",
        "Names, topics, promises — if it was said, you can find it."
      );
      await moveClick(page, page.locator('[data-tour="nav-search"]'));
      await sleep(600);
      await page.keyboard.type("rollout", { delay: 110 });
      await sleep(BEAT_MS * 1.5);
      await page.keyboard.press("Escape");
      await caption(page, "");
    });

    // -- Finale ----------------------------------------------------------
    await chapter("finale", async () => {
      await moveClick(page, page.locator('[data-tour="nav-home"]'));
      await caption(
        page,
        "Snowy — your meetings, remembered",
        "Set up once. After that, the bar is always there — one click from every meeting."
      );
      await sleep(BEAT_MS * 2);
    });
  } finally {
    sysPlayer?.kill();
    const frames = capture ? await capture.stop() : [];
    await app.close().catch(() => {});
    assembleVideo(frames);
    killTree(devServer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
