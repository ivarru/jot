import { spawn, spawnSync } from "node:child_process";
import { openSync } from "node:fs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const buildLog = "/tmp/jot-preview-test-fake-build.log";
const previewLog = "/tmp/jot-preview-test-fake-preview.log";
const buildLogFd = openSync(buildLog, "w");
const previewLogFd = openSync(previewLog, "w");

console.log(`Building fake-auth preview. Build log: ${buildLog}`);

const build = spawnSync(npmCommand, ["run", "build"], {
  env: {
    ...process.env,
    VITE_ENABLE_FAKE_AUTH: "true"
  },
  stdio: ["ignore", buildLogFd, buildLogFd]
});

if (build.status !== 0) {
  console.error(`Fake-auth build failed. See ${buildLog}`);
  process.exit(build.status ?? 1);
}

console.log(`Starting fake-auth preview. Preview log: ${previewLog}`);
const preview = spawn(npmCommand, ["run", "preview"], {
  stdio: ["ignore", previewLogFd, previewLogFd]
});

const stopPreview = () => {
  if (!preview.killed) preview.kill();
};

process.on("SIGINT", () => {
  stopPreview();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopPreview();
  process.exit(143);
});

preview.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
