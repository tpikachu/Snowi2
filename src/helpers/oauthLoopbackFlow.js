const http = require("http");
const crypto = require("crypto");
const { shell } = require("electron");

const OAUTH_TIMEOUT_MS = 120000;

// Thrown by handleCallback to control the error code shown on the local
// completion page (defaults to "server_error").
class OAuthFlowError extends Error {
  constructor(redirectCode, message) {
    super(message);
    this.redirectCode = redirectCode;
  }
}

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );

// The loopback server answers the browser directly with a minimal completion
// page — no hosted callback page, so the flow works fully offline once the
// provider redirects back.
function respondCompletionPage(res, { ok, errorCode } = {}) {
  const body = ok
    ? "<h3>Calendar connected.</h3><p>You can close this tab and return to the app.</p>"
    : `<h3>Calendar connection failed.</h3><p>Error: ${escapeHtml(
        errorCode || "server_error"
      )}. You can close this tab and try again from the app.</p>`;
  res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<html><body>${body}</body></html>`);
}

// Runs a PKCE auth-code flow through an ephemeral 127.0.0.1 server:
// - buildAuthUrl(redirectUri, state, codeChallenge) → provider authorize URL
// - handleCallback(code, redirectUri, codeVerifier) → resolves the flow result;
//   called once with a state-validated code, throws (OAuthFlowError for a
//   specific completion-page code) to reject.
function runOAuthLoopbackFlow({ buildAuthUrl, handleCallback }) {
  return new Promise((resolve, reject) => {
    const codeVerifier = crypto.randomBytes(32).toString("base64url").slice(0, 43);
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    const state = crypto.randomBytes(32).toString("hex");

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1`);
        const returnedState = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          respondCompletionPage(res, { ok: false, errorCode: error });
          cleanup();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<html><body><h3>Invalid request.</h3></body></html>");
          return;
        }

        const redirectUri = `http://127.0.0.1:${server.address().port}`;
        const result = await handleCallback(code, redirectUri, codeVerifier);

        respondCompletionPage(res, { ok: true });
        cleanup();
        resolve(result);
      } catch (err) {
        respondCompletionPage(res, { ok: false, errorCode: err.redirectCode || "server_error" });
        cleanup();
        reject(err);
      }
    });

    let timeoutId;

    const cleanup = () => {
      clearTimeout(timeoutId);
      server.close();
    };

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}`;
      shell.openExternal(buildAuthUrl(redirectUri, state, codeChallenge));
    });

    timeoutId = setTimeout(() => {
      server.close();
      reject(new Error("OAuth flow timed out"));
    }, OAUTH_TIMEOUT_MS);

    server.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}

module.exports = { runOAuthLoopbackFlow, OAuthFlowError };
