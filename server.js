const http = require("http");
const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "public");

// The platform injects PORT (usually 8080). WIZARD_PORT is the port assigned
// during the "Deploy New" wizard (Part B, Step 4). Update WIZARD_PORT if your
// assigned port changes.
const INJECTED_PORT = process.env.PORT || 8080;
const WIZARD_PORT = 3146;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function requestHandler(req, res) {
  let decodedUrl;
  try {
    decodedUrl = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return;
  }

  const safePath = path.normalize(decodedUrl).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(PUBLIC_DIR, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
}

// Bind 0.0.0.0, never 127.0.0.1 — inside a container 127.0.0.1 is unreachable
// from outside. Listen on both the injected PORT and the wizard port so the
// gateway's health check succeeds regardless of which one it probes.
const injectedServer = http.createServer(requestHandler);
injectedServer.listen(INJECTED_PORT, "0.0.0.0", () => {
  console.log(`Listening on 0.0.0.0:${INJECTED_PORT} (injected PORT)`);
});

if (WIZARD_PORT !== Number(INJECTED_PORT)) {
  const wizardServer = http.createServer(requestHandler);
  wizardServer.listen(WIZARD_PORT, "0.0.0.0", () => {
    console.log(`Listening on 0.0.0.0:${WIZARD_PORT} (wizard port)`);
  });
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
