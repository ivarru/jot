import { defineConfig } from "@solidjs/start/config";

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
    base: process.env.BASE_PATH ?? "/"
  }
});
