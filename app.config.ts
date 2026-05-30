import { defineConfig } from "@solidjs/start/config";
import packageJson from "./package.json";

declare const process: {
  readonly env: {
    readonly BASE_PATH?: string;
  };
};

export default defineConfig({
  ssr: false,
  server: {
    preset: "static"
  },
  vite: {
    base: process.env.BASE_PATH ?? "/",
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version)
    },
    build: {
      modulePreload: false
    }
  }
});
