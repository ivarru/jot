// @refresh reload
import type { Component, JSX } from "solid-js";
import { createHandler, StartServer } from "@solidjs/start/server";

interface DocumentProps {
  readonly assets: JSX.Element;
  readonly children?: JSX.Element;
  readonly scripts: JSX.Element;
}

const Document: Component<DocumentProps> = (props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="manifest" href={`${import.meta.env.BASE_URL}manifest.webmanifest`} />
      {props.assets}
    </head>
    <body>
      <div id="app">{props.children}</div>
      {props.scripts}
    </body>
  </html>
);

export default createHandler(() => <StartServer document={Document} />);
