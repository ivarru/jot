// @refresh reload
import type { Component, JSX } from "solid-js";
import { createHandler, StartServer } from "@solidjs/start/server";
import { VIEWPORT_META_CONTENT } from "./documentHead";

interface DocumentProps {
  readonly assets: JSX.Element;
  readonly children?: JSX.Element;
  readonly scripts: JSX.Element;
}

const Document: Component<DocumentProps> = (props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content={VIEWPORT_META_CONTENT} />
      <link rel="manifest" href={`${import.meta.env.BASE_URL}manifest.webmanifest`} />
      <link rel="icon" href={`${import.meta.env.BASE_URL}icons/icon.svg`} type="image/svg+xml" />
      {props.assets}
    </head>
    <body>
      <div id="app">{props.children}</div>
      {props.scripts}
    </body>
  </html>
);

export default createHandler(() => <StartServer document={Document} />);
