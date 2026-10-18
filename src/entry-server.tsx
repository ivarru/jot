// @refresh reload
import type { Component, JSX } from "solid-js";
import { createHandler, StartServer } from "@solidjs/start/server";
import { PRODUCTION_CONTENT_SECURITY_POLICY, REFERRER_POLICY, VIEWPORT_META_CONTENT } from "./documentHead";

interface DocumentProps {
  readonly assets?: JSX.Element;
  readonly children?: JSX.Element;
  readonly scripts: JSX.Element;
}

const Document: Component<DocumentProps> = (props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      {import.meta.env.PROD && <meta http-equiv="content-security-policy" content={PRODUCTION_CONTENT_SECURITY_POLICY} />}
      <meta name="referrer" content={REFERRER_POLICY} />
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
