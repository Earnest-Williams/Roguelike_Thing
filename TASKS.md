# Follow-up Task Suggestions

## Typo Fix
- Rename the Delaunay helper `calcCircumCirc`/`circumCirc` to `calcCircumCircle`/`circumCircle` so the identifier matches the mathematical term "circumcircle" and reads correctly in the codebase. 【F:index.html†L2688-L2712】

## Bug Fix
- Resolve the `clamp01` redeclaration by unifying the existing function definition with the later constant assignment; the duplicate identifier currently triggers a syntax error that prevents the script from loading. 【F:index.html†L893-L898】【F:index.html†L2779-L2799】

## Documentation/Comment Correction
- Update the hybrid generator comments that still reference the old `test.html`/`test2` scaffolding so they describe the current in-repo implementation instead of pointing to non-existent files. 【F:index.html†L2774-L2798】

## Test Improvement
- Add a targeted unit/integration test for `bfsToTarget` to ensure the autonomous explorer can still route through explored tiles after future refactors; exercising the routine would guard the backtracking/frontier behaviour it encodes. 【F:index.html†L3388-L3436】
