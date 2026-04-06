import type { Plugin } from "vite";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const ALLOWED_ROOT = path.join(os.homedir(), "Documents", "Writer");

function safePath(requested: string): string | null {
  const resolved = path.resolve(requested);
  if (!resolved.startsWith(ALLOWED_ROOT)) return null;
  return resolved;
}

function readBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default function devFsPlugin(): Plugin {
  return {
    name: "writer-dev-fs",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__fs/")) return next();

        res.setHeader("Content-Type", "application/json");

        try {
          const url = new URL(req.url, "http://localhost");
          const action = url.pathname.replace("/__fs/", "");

          if (req.method === "GET") {
            const filePath = safePath(url.searchParams.get("path") ?? "");
            if (!filePath) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: "path outside allowed root" }));
              return;
            }

            if (action === "exists") {
              res.end(JSON.stringify({ exists: fs.existsSync(filePath) }));
              return;
            }

            if (action === "read-text") {
              if (!fs.existsSync(filePath)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: "not found" }));
                return;
              }
              const content = await fsp.readFile(filePath, "utf-8");
              res.end(JSON.stringify({ content }));
              return;
            }

            if (action === "read-file") {
              if (!fs.existsSync(filePath)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: "not found" }));
                return;
              }
              const data = await fsp.readFile(filePath);
              res.end(JSON.stringify({ data: data.toString("base64") }));
              return;
            }

            if (action === "read-dir") {
              if (!fs.existsSync(filePath)) {
                res.end(JSON.stringify({ entries: [] }));
                return;
              }
              const entries = await fsp.readdir(filePath, { withFileTypes: true });
              res.end(
                JSON.stringify({
                  entries: entries.map((e) => ({
                    name: e.name,
                    isDirectory: e.isDirectory(),
                    isFile: e.isFile(),
                  })),
                })
              );
              return;
            }
          }

          if (req.method === "POST") {
            const body = JSON.parse(await readBody(req));
            const filePath = safePath(body.path ?? "");
            if (!filePath) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: "path outside allowed root" }));
              return;
            }

            if (action === "mkdir") {
              await fsp.mkdir(filePath, { recursive: !!body.recursive });
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (action === "write-text") {
              await fsp.mkdir(path.dirname(filePath), { recursive: true });
              await fsp.writeFile(filePath, body.contents ?? "", "utf-8");
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (action === "write-file") {
              await fsp.mkdir(path.dirname(filePath), { recursive: true });
              await fsp.writeFile(filePath, Buffer.from(body.data ?? "", "base64"));
              res.end(JSON.stringify({ ok: true }));
              return;
            }

            if (action === "remove") {
              if (fs.existsSync(filePath)) {
                await fsp.rm(filePath, { recursive: !!body.recursive, force: true });
              }
              res.end(JSON.stringify({ ok: true }));
              return;
            }
          }

          res.statusCode = 404;
          res.end(JSON.stringify({ error: `unknown fs action: ${action}` }));
        } catch (err: any) {
          console.error("[dev-fs]", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}
