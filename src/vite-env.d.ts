declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare const __APP_VERSION__: string;
declare const __APP_PROJECT_URL__: string;
declare const __APP_LICENSE__: string;
declare const __APP_COPYRIGHT__: string;
declare const __MILKDOWN_VERSION__: string;
