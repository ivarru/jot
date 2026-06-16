import { spawn, spawnSync } from "node:child_process";
import { loadEnv } from "vite";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const developmentEnv = loadEnv("development", process.cwd(), "");
const clientId = developmentEnv.VITE_GOOGLE_CLIENT_ID?.trim();

if (!clientId) {
  console.error("Missing VITE_GOOGLE_CLIENT_ID in the development local environment.");
  process.exit(1);
}

const build = spawnSync(npmCommand, ["run", "build"], {
  env: {
    ...process.env,
    VITE_ENABLE_FAKE_AUTH: "false",
    VITE_GOOGLE_CLIENT_ID: clientId
  },
  stdio: "inherit"
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const preview = spawn(npmCommand, ["run", "preview"], {
  stdio: "inherit"
});

preview.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
