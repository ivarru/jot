import { defineConfig } from "@solidjs/start/config";
import packageLock from "./package-lock.json";
import packageJson from "./package.json";

declare const process: {
  readonly env: {
    readonly BASE_PATH?: string;
  };
};

const projectUrl = packageJson.repository.url.replace(/\.git$/, "");
const milkdownKitVersion = packageLock.packages["node_modules/@milkdown/kit"].version;

export default defineConfig({
  ssr: false,
  server: {
    preset: "static"
  },
  vite: {
    base: process.env.BASE_PATH ?? "/",
    define: {
      __APP_COPYRIGHT__: JSON.stringify(`Copyright (c) 2026 ${packageJson.author}`),
      __APP_LICENSE__: JSON.stringify(packageJson.license),
      __APP_PROJECT_URL__: JSON.stringify(projectUrl),
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __MILKDOWN_VERSION__: JSON.stringify(milkdownKitVersion)
    },
    build: {
      modulePreload: false
    }
  }
});
