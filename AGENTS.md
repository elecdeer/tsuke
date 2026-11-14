# AGENTS.md

Notes for coding agents working in this repository. General Vite+ usage is in [CLAUDE.md](CLAUDE.md).

## Testing

### Test projects

The root [vitest.config.ts](vitest.config.ts) runs these projects together:

| Project             | Files                                                | Runs in                             |
| ------------------- | ---------------------------------------------------- | ----------------------------------- |
| `extension/unit`    | `apps/extension/src/**/*.test.{ts,tsx}`              | Node                                |
| `extension/browser` | `apps/extension/src/**/*.test.browser.{ts,tsx}`      | Chromium (Vitest browser mode, MSW) |
| `ledger/unit`       | `apps/ledger/**/*.test.ts`                           | Node                                |
| `ui/unit`           | `packages/ui/src/**/*.test.ts`                       | Node                                |
| `ui/storybook`      | `packages/ui/src/**/*.stories.tsx` (render + `play`) | Chromium (Storybook Vitest addon)   |

Stories in `packages/ui` are tests: each story must render, and its `play` function runs as the test. When you change a `@tsuke/ui` component, update or add a story with a `play` function rather than a separate test file.

### Before running

- In a fresh checkout or worktree, run `vp install` first. Its `postinstall` runs `void prepare` for the ledger.
- The browser projects need Playwright's Chromium. If it is missing, run `vp exec playwright install chromium` in `apps/extension`.
- `vp check` type-checks the extension against the ledger client's declaration files. Generate them first, or `vp check` reports around 180 type errors from `ledger/client`:

```bash
vp run "ledger#build:types"
```

### Running

Run the same steps as CI (`.github/workflows/ci.yml`):

```bash
vp run "ledger#build:types"
```

```bash
vp check
```

```bash
vp run lint:css
```

```bash
vp run -r test
```

`vp run ready` runs these and then builds everything.

To run part of the suite, filter by project or by file from the repository root:

```bash
vp test run --project ui/storybook
```

```bash
vp test run apps/ledger/src/web/format.test.ts
```

### Visual regression tests

`apps/extension/src/entrypoints/sidepanel/screens/MainScreen.test.browser.tsx` compares screenshots with `toMatchScreenshot`.

- Only the Linux references (`__screenshots__/**/*-chromium-linux.png`) are committed; CI compares against them.
- On macOS the first run cannot find a `-chromium-darwin.png` reference, writes one, and fails. Later local runs compare against that local image, so they say nothing about CI. The darwin images are gitignored; delete them after the run.
- To check or update the Linux references, run the browser tests in Docker (Docker must be running). Pass `--no-cache`: `vp run` caches the script and otherwise replays the previous result without starting Docker.

```bash
vp run --no-cache test:browser
```

```bash
vp run --no-cache test:browser:update
```

- The comparison is tolerant (`threshold: 0.3`, `allowedMismatchedPixelRatio: 0.05` in `apps/extension/vitest.config.browser.ts`), and `--update` rewrites only the references that fail. A visual change can therefore pass and leave outdated references behind. After an intended visual change to the side panel, delete the `-chromium-linux.png` files, run the update again to regenerate them, look at the new images, and commit them.

### Checking the UI by eye

`.claude/launch.json` defines two preview servers:

- `ui-storybook` (port 6007): the `@tsuke/ui` Storybook. Open a single story at `http://localhost:6007/iframe.html?id=<story-id>&viewMode=story`; `http://localhost:6007/index.json` lists the story ids.
- `ledger` (port 5173): the ledger web app, for example `/transactions/new` for the transaction form. Check narrow screens too, since the form changes layout below the `md` and `@xl` breakpoints.
