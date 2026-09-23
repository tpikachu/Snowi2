// @ts-check
const http = require("http");
const net = require("net");

/**
 * A local, unauthenticated HTTP proxy that tunnels every CONNECT through an
 * authenticated upstream HTTP proxy, for the live-provider spec.
 *
 * Chromium takes `--proxy-server` but cannot carry a proxy's credentials on
 * the flag, and the app has no proxy-login handler (it should not: a user's
 * proxy is the OS's business). So on a machine that reaches a provider only
 * through a proxy, the spec runs this forwarder for the life of the test and
 * points Electron at it. The upstream URL, credentials included, comes from
 * the environment of the command that runs the test and is never written
 * anywhere. Plain (non-CONNECT) requests are refused: every provider call is
 * HTTPS, and the Vite dev server on localhost bypasses the proxy by
 * Chromium's implicit loopback rule.
 *
 * @param {string} upstreamUrl e.g. http://user:pass@proxy.example:8080
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
async function startForwardingProxy(upstreamUrl) {
  const upstream = new URL(upstreamUrl);
  const auth = upstream.username
    ? "Basic " +
      Buffer.from(
        `${decodeURIComponent(upstream.username)}:${decodeURIComponent(upstream.password)}`
      ).toString("base64")
    : null;

  const server = http.createServer((_req, res) => {
    res.writeHead(405);
    res.end();
  });

  server.on("connect", (req, clientSocket, head) => {
    const target = req.url || "";
    const socket = net.connect(Number(upstream.port) || 80, upstream.hostname, () => {
      socket.write(
        `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n` +
          (auth ? `Proxy-Authorization: ${auth}\r\n` : "") +
          "\r\n"
      );
    });
    let established = false;
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      if (established) return;
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf("\r\n\r\n");
      if (end === -1) return;
      const statusLine = buffer.toString("latin1", 0, end).split("\r\n")[0];
      if (!/^HTTP\/1\.[01] 200/.test(statusLine)) {
        clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        socket.destroy();
        return;
      }
      established = true;
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      const rest = buffer.subarray(end + 4);
      if (rest.length) clientSocket.write(rest);
      if (head.length) socket.write(head);
      socket.pipe(clientSocket);
      clientSocket.pipe(socket);
    });
    socket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => socket.destroy());
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = /** @type {import("net").AddressInfo} */ (server.address());
  return {
    port: address.port,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}

module.exports = { startForwardingProxy };
