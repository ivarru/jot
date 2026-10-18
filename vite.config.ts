import { solidStart } from "@solidjs/start/config";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { env } from "node:process";
import packageLock from "./package-lock.json";
import packageJson from "./package.json";

const projectUrl = packageJson.repository.url.replace(/\.git$/, "");
const milkdownKitVersion = packageLock.packages["node_modules/@milkdown/kit"].version;

export default defineConfig({
  plugins: [solidStart({ ssr: false }), nitro()],
  base: env.BASE_PATH ?? "/",
  nitro: {
    preset: "static",
    prerender: { routes: ["/"], failOnError: true }
  },
  define: {
    __APP_COPYRIGHT__: JSON.stringify(`Copyright (c) 2026 ${packageJson.author}`),
    __APP_LICENSE__: JSON.stringify(packageJson.license),
    __APP_PROJECT_URL__: JSON.stringify(projectUrl),
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __MILKDOWN_VERSION__: JSON.stringify(milkdownKitVersion)
  },
  build: { modulePreload: false }
});
