Current priorities:
- Keep audio trigger timing stable and crash-free.
- Preserve scene-native drag/drop workflow.
- Prefer concise floating HUD, not text-heavy panels.

Recent pitfalls to remember:
- GitHub Pages deploys under a repo subpath, so model URLs must be relative instead of root-absolute.
- `import.meta.env.BASE_URL` caused avoidable typing friction in CI. For this repo, simple relative model paths are the safer option.
- Pages build failed on npm optional Rollup binaries; keep the workflow and `optionalDependencies` workaround unless deployment tooling changes.
- CI TypeScript was stricter than local runs. Common fixes were explicit literal typing (`0 | 90`), removing unused store reads, and local declaration files for Three examples modules.
- Local Windows npm operations can leave `node_modules` half-broken or hold file locks on `esbuild` / `rollup`. Be careful when relying on local install state after interrupted commands.
