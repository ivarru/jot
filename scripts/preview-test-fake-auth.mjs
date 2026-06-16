import { spawn, spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const build = spawnSync(npmCommand, ["run", "build"], {
  env: {
    ...process.env,
    VITE_ENABLE_FAKE_AUTH: "true"
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
