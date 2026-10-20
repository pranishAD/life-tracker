// Render a page inside the same providers main.tsx uses (React Query,
// toasts, router), at a given URL, plus a <CurrentPath/> probe so tests can
// assert where navigation went.
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "../context/ToastContext";

function CurrentPath() {
  const loc = useLocation();
  return <div data-testid="path">{loc.pathname + loc.search}</div>;
}

export function renderRoute(url: string, routes: { path: string; element: ReactElement }[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            {routes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
            <Route path="*" element={<div>Other page</div>} />
          </Routes>
          <CurrentPath />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, client, path: () => screen.getByTestId("path").textContent };
}

/** Tiny stand-in for @emoji-mart/data so pickers don't load 400 KB in tests. */
export const FAKE_EMOJI_DATA = {
  categories: [
    { id: "activity", emojis: ["runner", "muscle"] },
    { id: "objects", emojis: ["rocket", "books"] },
  ],
  emojis: {
    runner: { id: "runner", name: "Runner", keywords: ["running", "run"], skins: [{ unified: "1f3c3", native: "🏃" }], version: 1 },
    muscle: { id: "muscle", name: "Flexed Biceps", keywords: ["gym", "strong"], skins: [{ unified: "1f4aa", native: "💪" }], version: 1 },
    rocket: { id: "rocket", name: "Rocket", keywords: ["launch", "ship"], skins: [{ unified: "1f680", native: "🚀" }], version: 1 },
    books: { id: "books", name: "Books", keywords: ["read", "study"], skins: [{ unified: "1f4da", native: "📚" }], version: 1 },
  },
  aliases: {},
  sheet: { cols: 0, rows: 0 },
};
