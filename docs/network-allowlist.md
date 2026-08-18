# Network Allowlist

Outbound hosts the Snowi desktop app can contact. For firewall, proxy, and
DNS filter configuration.

All connections are client-initiated over TLS. No inbound ports. There is
**no update feed** (auto-update is disabled in this build), **no telemetry**,
and **no vendor account or cloud API service**. A fully local install (local
Whisper/Parakeet transcription, local reasoning, no calendar or BYOK
providers configured) only ever contacts the model/binary download hosts
below.

## Model and runtime downloads

Contacted when a model or optional runtime is downloaded (Whisper GGML,
Parakeet, local GGUF reasoning models, the MiniLM embedding model on first
launch, whisper VAD/diarization models, bundled yt-dlp, and on-demand
CUDA/Vulkan GPU runtimes).

| Host                                                    | Protocol | Port | Purpose                                                                                                       |
| ------------------------------------------------------- | -------- | ---- | ------------------------------------------------------------------------------------------------------------- |
| `huggingface.co`                                        | HTTPS    | 443  | Whisper GGML, GGUF, MiniLM embedding, and VAD model downloads.                                                |
| `cdn-lfs.huggingface.co`, `cdn-lfs-us-1.huggingface.co` | HTTPS    | 443  | HuggingFace large-file CDN (LFS-backed model files).                                                          |
| `github.com`, `api.github.com`, `objects.githubusercontent.com` | HTTPS | 443 | GitHub releases: Parakeet model archives (sherpa-onnx releases), diarization models, yt-dlp, CUDA/Vulkan GPU runtimes. |

Build-time only (developers packaging the app, not end-user machines): the
`scripts/download-*.js` scripts fetch sidecar binaries (whisper.cpp,
sherpa-onnx, Qdrant, llama.cpp, nircmd, native listeners) from `github.com` /
`objects.githubusercontent.com` and `www.nirsoft.net`.

## Calendar sync (optional feature)

Contacted only if the user connects a calendar in settings. The OAuth
redirect is served on an ephemeral local `127.0.0.1` loopback server (PKCE) —
no external callback host.

**Google Calendar:**

| Host                    | Protocol | Port | Purpose                                 |
| ----------------------- | -------- | ---- | --------------------------------------- |
| `accounts.google.com`   | HTTPS    | 443  | OAuth authorization (opens in browser). |
| `oauth2.googleapis.com` | HTTPS    | 443  | OAuth token exchange and revoke.        |
| `www.googleapis.com`    | HTTPS    | 443  | Calendar event and calendar list reads. |

**Microsoft Calendar:**

| Host                        | Protocol | Port | Purpose                                     |
| --------------------------- | -------- | ---- | ------------------------------------------- |
| `login.microsoftonline.com` | HTTPS    | 443  | OAuth authorization and token exchange.     |
| `graph.microsoft.com`       | HTTPS    | 443  | Graph API calendar reads (delta sync).      |

Apple Calendar (macOS) is read locally through EventKit — no network access.

## URL audio import (optional feature)

Contacted only when a user pastes a URL into the Upload view to download and
transcribe its audio. Downloads are HTTPS-only and hosts resolving to
private/internal addresses are rejected.

| Host                                                                               | Protocol | Port | Purpose                                                                      |
| ---------------------------------------------------------------------------------- | -------- | ---- | ---------------------------------------------------------------------------- |
| `www.youtube.com`, `youtube.com`, `youtu.be`, `m.youtube.com`, `music.youtube.com` | HTTPS    | 443  | YouTube page/metadata fetch for pasted YouTube links (bundled yt-dlp).       |
| `*.googlevideo.com`                                                                | HTTPS    | 443  | YouTube media CDN — the actual audio stream download.                        |
| _User-pasted hosts_                                                                | HTTPS    | 443  | Direct audio/video URL imports contact whatever public host the user pastes. |

## BYOK provider hosts (only if configured)

Required only when a user configures their own API key for the corresponding
provider (transcription, streaming transcription, or AI reasoning). Skip any
provider not in use.

| Host                                | Protocol   | Port | Used when                                                                                                                                                                                                                                             |
| ----------------------------------- | ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api.openai.com`                    | WSS, HTTPS | 443  | OpenAI API key configured (Whisper cloud transcription, Realtime streaming transcription, or reasoning).                                                                                                                                              |
| `api.anthropic.com`                 | HTTPS      | 443  | Anthropic API key configured.                                                                                                                                                                                                                          |
| `generativelanguage.googleapis.com` | HTTPS      | 443  | Gemini API key configured.                                                                                                                                                                                                                             |
| `api.groq.com`                      | HTTPS      | 443  | Groq API key configured.                                                                                                                                                                                                                               |
| `api.x.ai`                          | HTTPS      | 443  | xAI API key configured.                                                                                                                                                                                                                                |
| `api.mistral.ai`                    | HTTPS      | 443  | Mistral API key configured.                                                                                                                                                                                                                            |
| `openrouter.ai`                     | HTTPS      | 443  | OpenRouter selected as a reasoning provider (`/api/v1/models` is fetched even without a key).                                                                                                                                                          |
| `atc.tinfoil.sh`, `*.tinfoil.sh`    | WSS, HTTPS | 443  | Tinfoil API key configured. `atc.tinfoil.sh` serves the enclave attestation bundle (verified locally). Inference and realtime transcription connect to an enclave host assigned at runtime (e.g. `inference.tinfoil.sh`), so allowlist `*.tinfoil.sh`. |
| `api.deepgram.com`                  | WSS, HTTPS | 443  | Deepgram API key configured (streaming transcription).                                                                                                                                                                                                 |
| `streaming.assemblyai.com`          | WSS, HTTPS | 443  | AssemblyAI API key configured (streaming transcription; token endpoint is HTTPS, live session is WSS).                                                                                                                                                 |
| `api.eu.corti.app`, `auth.eu.corti.app`, `ai.eu.corti.app` (and `.us.` equivalents) | WSS, HTTPS | 443 | Corti credentials configured. Region subdomain follows the configured Corti environment.                                                                                                                                                              |

**Enterprise providers** (centrally managed credentials):

| Host                                                                             | Protocol | Port | Used when                                                                                              |
| -------------------------------------------------------------------------------- | -------- | ---- | ------------------------------------------------------------------------------------------------------ |
| AWS Bedrock regional endpoints (`bedrock-runtime.<region>.amazonaws.com`)         | HTTPS    | 443  | Bedrock credentials configured; region follows `BEDROCK_REGION`.                                       |
| `*.openai.azure.com`, `*.cognitiveservices.azure.com`, `*.services.ai.azure.com` | HTTPS    | 443  | Azure OpenAI configured — the customer's own resource endpoint (`AZURE_OPENAI_ENDPOINT`).              |
| `aiplatform.googleapis.com` (regional: `<region>-aiplatform.googleapis.com`)     | HTTPS    | 443  | Vertex AI configured.                                                                                  |

**Custom / self-hosted endpoints:** the Custom transcription and reasoning
modes, the custom-ASR shim, and LAN inference contact whatever base URL the
user configures. HTTPS is required except for loopback and private-range
hosts. Local providers (llama.cpp, sherpa-onnx, Qdrant) listen on `127.0.0.1`
only and make no external calls.

## Notes

- The app uses Electron's network stack, which honors system proxy settings
  (macOS System Settings, Windows Internet Options / WPAD, GNOME proxy) and
  PAC scripts on all platforms.
- Connections fail with `ENOTFOUND` if DNS is filtered, `ECONNREFUSED` /
  `ETIMEDOUT` if a firewall blocks the host, and `CERT_HAS_EXPIRED` /
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE` if a TLS-intercepting proxy is in the
  path without its root certificate trusted by the OS.
- IP-pinning is not supported. The hosts above resolve to provider-managed
  IPs that change without notice.
- On minimal Linux containers without a system CA bundle (Alpine, distroless),
  set `NODE_EXTRA_CA_CERTS` to your CA bundle path so corporate TLS interception
  is trusted.

## How to test

Run from a machine on the same network as the user. A successful response
(any HTTP status, including `401`) confirms the network path works.

```sh
# Model downloads (only if local models are in use)
curl -v -I https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin

# BYOK providers (only the ones configured)
curl -v https://api.openai.com/v1/models
curl -v https://api.deepgram.com/v1/projects
curl -v https://streaming.assemblyai.com/v3/token

# Calendar (only if connected)
curl -v -I https://www.googleapis.com
curl -v -I https://graph.microsoft.com
```

If a request returns `Could not resolve host`, the DNS layer (resolver,
filter, or ad blocker) is blocking the domain. If it hangs or returns
`Connection refused`, a firewall is blocking the port. If it returns a TLS
error, a proxy is intercepting the connection without a trusted root.
