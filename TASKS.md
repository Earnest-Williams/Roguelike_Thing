# Task Tracker

Structured backlog of actionable follow-ups identified during the latest code review.

## 🚨 High priority

- [ ] Add an `npm test` script that proxies to `tests/run-basic-tests.js` so CI and contributors can run the regression suite with a standard command.
- [ ] Promote the manual/performance harnesses to automated coverage (or document their usage) so key scenarios are exercised during routine runs.
- [ ] Extend `tests/run-basic-tests.js` with an optional summary/report mode so CI logs highlight encounter deltas without manual inspection.

## ⚔️ Combat & systems

- [ ] Consolidate the browser status registry with `src/combat/status-registry.js` to avoid diverging definitions between the Node tests and the in-browser client.
- [ ] Expand the simulation harness with scripted matchups (e.g. boss templates, mixed loadouts) and assert expected win rates alongside the existing brigand-vs-dummy baseline.

## 🖥 Front-end & tooling

- [ ] Extract the large inline module in `index.html` into dedicated files under `src/` or `js/` to simplify maintenance and enable bundling/minification workflows.
- [ ] Provide a documented command (CLI script or npm task) for running `simulate` comparisons without editing test files, enabling quick balance spot-checks from the shell.

## 📝 Documentation & onboarding

- [ ] Capture the deterministic RNG workflow (`setSeed`, saved seeds from simulations) in the README or docs folder so contributors can reproduce tricky runs.
- [ ] Write a short how-to on using `tests/combat-sandbox.js` as a template for custom investigations, including examples of logging mitigation flows.
