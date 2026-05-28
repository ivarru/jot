import { Link, MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import "./styles.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>Jot</Title>
          <Link rel="icon" type="image/svg+xml" href={`${import.meta.env.BASE_URL}icons/icon.svg`} />
          {props.children}
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
