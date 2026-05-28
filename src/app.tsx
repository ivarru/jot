import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import "./styles.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>Jot</Title>
          {props.children}
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
