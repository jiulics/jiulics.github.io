#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";

const DEFAULT_GENERATE_ENDPOINT = "https://img2.suneora.com/api/image-tasks/generations";
const DEFAULT_TASKS_ENDPOINT = "https://img2.suneora.com/api/image-tasks";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_SIZE = "16:9";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const text = await readFile(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function printHelp() {
  console.log(`Generate a blog background image with the configured image model.

Usage:
  node scripts/generate-blog-image.mjs --prompt "..." --out static/images/generated/blog-bg.png

Options:
  --prompt <text>      Required image prompt
  --out <path>         Output file path, default static/images/generated/blog-bg.png
  --endpoint <url>     Generation endpoint, default IMAGE2_ENDPOINT or ${DEFAULT_GENERATE_ENDPOINT}
  --tasks-endpoint <url> Polling endpoint, default IMAGE2_TASKS_ENDPOINT or derived from --endpoint
  --model <name>       Model name, default IMAGE2_MODEL or ${DEFAULT_MODEL}
  --size <ratio>       Image size, default IMAGE2_SIZE or ${DEFAULT_SIZE}
  --n <number>         Number of images requested, default 1
  --help               Show this help

Environment:
  IMAGE2_API_KEY       Required API key
  IMAGE2_ENDPOINT      Optional endpoint override
  IMAGE2_TASKS_ENDPOINT Optional polling endpoint override
  IMAGE2_MODEL         Optional model override
  IMAGE2_SIZE          Optional size override
  CHATGPT2API_AUTH_KEY   Optional alternate API key name
  CHATGPT2API_ENDPOINT   Optional alternate endpoint override
  CHATGPT2API_TASKS_ENDPOINT Optional alternate polling endpoint override
  CHATGPT2API_MODEL      Optional alternate model override

The script also reads .env.local from the repository root. Do not commit .env.local.
`);
}

function getImageFromResponse(json) {
  const first = Array.isArray(json?.data) ? json.data[0] : null;
  const candidates = [
    first?.b64_json,
    first?.b64,
    first?.image_base64,
    first?.image,
    json?.b64_json,
    json?.b64,
    json?.image_base64,
    json?.image,
    Array.isArray(json?.images) ? json.images[0] : null,
  ].filter(Boolean);

  const base64 = candidates.find((value) => typeof value === "string" && !/^https?:\/\//i.test(value));
  const url = [first?.url, json?.url, ...candidates].find((value) => typeof value === "string" && /^https?:\/\//i.test(value));

  return { base64, url };
}

function deriveTasksEndpoint(endpoint) {
  return endpoint.replace(/\/generations\/?$/, "");
}

function normalizeBase64(value) {
  return value.replace(/^data:image\/\w+;base64,/, "");
}

async function download(url, apiKey) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download image ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function fetchJson(endpoint, apiKey, body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Image API failed ${response.status}: ${raw}`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Image API did not return JSON: ${raw.slice(0, 500)}`);
  }
}

async function pollTasks(tasksEndpoint, apiKey, ids, timeoutMs = 15 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const endpoint = `${tasksEndpoint}?ids=${encodeURIComponent(ids.join(","))}`;
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Task poll failed ${response.status}: ${raw}`);
    }

    const json = JSON.parse(raw);
    const items = Array.isArray(json?.items) ? json.items : [];
    const byId = new Map(items.map((item) => [item?.id, item]));
    const ready = [];
    let pending = 0;

    for (const id of ids) {
      const task = byId.get(id);
      if (!task) {
        pending += 1;
        continue;
      }
      if (task.status === "error") {
        throw new Error(`Image task ${id} failed: ${task.error || "unknown error"}`);
      }
      if (task.status === "success") {
        ready.push(task);
      } else {
        pending += 1;
      }
    }

    if (ready.length > 0 && pending === 0) {
      return ready;
    }

    await sleep(2000);
  }

  throw new Error(`Timed out waiting for image tasks: ${ids.join(", ")}`);
}

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const prompt = args.prompt;
  if (!prompt) throw new Error("Missing required --prompt argument.");

  const apiKey =
    process.env.IMAGE2_API_KEY ||
    process.env.CHATGPT2API_AUTH_KEY ||
    process.env.CHATGPT2API_API_KEY;
  if (!apiKey) {
    throw new Error("Missing IMAGE2_API_KEY. Set it in your shell or in .env.local.");
  }

  const endpoint =
    args.endpoint ||
    process.env.IMAGE2_ENDPOINT ||
    process.env.CHATGPT2API_ENDPOINT ||
    DEFAULT_GENERATE_ENDPOINT;
  const tasksEndpoint =
    args["tasks-endpoint"] ||
    process.env.IMAGE2_TASKS_ENDPOINT ||
    process.env.CHATGPT2API_TASKS_ENDPOINT ||
    deriveTasksEndpoint(endpoint) ||
    DEFAULT_TASKS_ENDPOINT;
  const model = args.model || process.env.IMAGE2_MODEL || process.env.CHATGPT2API_MODEL || DEFAULT_MODEL;
  const size = args.size || process.env.IMAGE2_SIZE || DEFAULT_SIZE;
  const n = Number(args.n || process.env.IMAGE2_N || 1);
  const out = resolve(args.out || "static/images/generated/blog-bg.png");
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;

  const taskIds = Array.from({ length: count }, (_, index) => `${crypto.randomUUID()}-${index}`);
  await Promise.all(
    taskIds.map((clientTaskId) =>
      fetchJson(endpoint, apiKey, {
        client_task_id: clientTaskId,
        prompt,
        model,
        size,
      })
    )
  );

  const tasks = await pollTasks(tasksEndpoint, apiKey, taskIds);
  const primary = tasks.find((task) => task?.status === "success" && Array.isArray(task.data) && task.data.length > 0) || tasks[0];
  const { base64, url } = getImageFromResponse(primary);
  let buffer;
  if (base64) {
    buffer = Buffer.from(normalizeBase64(base64), "base64");
  } else if (url) {
    buffer = await download(url, apiKey);
  } else {
    throw new Error(`No image found in response: ${JSON.stringify(primary).slice(0, 1000)}`);
  }

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buffer);

  const rel = out.replace(resolve(process.cwd()) + "\\", "").replaceAll("\\", "/");
  console.log(`Saved ${basename(out)} (${buffer.length} bytes)`);
  console.log(rel || out);
  if (!extname(out)) console.warn("Output path has no extension; add .png, .jpg, or .webp as appropriate.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
