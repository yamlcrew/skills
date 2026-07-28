# use-nubjs

Reference and senior-engineer skill for nub (nubjs), the Rust CLI toolchain that augments Node.js —
TypeScript file runner, nub run / nubx runners, the pnpm-compatible package manager, nub pm and nub
node, and deployment.

## What it covers

One `use-nubjs` skill: a routing `SKILL.md` (tool model, 0.6.0 version context, critical rules,
task routing) plus 8 reference docs:

| Reference | Covers |
| --- | --- |
| `overview-and-install.md` | The augmenter-not-fork model, installing Nub (curl/brew/nix/mise/npm), `nub init`, `nub upgrade`, the v0 verb surface, `@nubjs/types` |
| `file-runner.md` | `nub <file>` (TS/JSX, no build step), supported extensions, Node auto-provisioning precedence, `--node`/`NODE_COMPAT`, `nub watch` |
| `runtime-typescript.md` | TypeScript/JSX transpile (oxc), `enum`/`namespace`, decorators + `emitDecoratorMetadata`, `using` downleveling, extensionless + `tsconfig#paths` resolution, `.env*` loading |
| `runtime-apis.md` | Data-format loaders (`.yaml`/`.toml`/`.jsonc`/`.json5`/`.txt`), web storage, Workers, debugging, and the Node-version-gated web-API unflag/polyfill matrix |
| `script-and-package-runner.md` | `nub run` (lifecycle hooks, `npm_*` env, workspaces, `--filter`/`--stream`) and `nubx`/`nub dlx`/`nub x`/`nub exec` |
| `package-manager.md` | `nub install`/`add`/`remove`/`update`/`ci`/`dedupe`/`import`, pnpm-compatible CLI, security defaults, compat-mode, lockfile compatibility, the virtual store |
| `pm-and-node.md` | `nub pm` Corepack-style shims and `nub node` version management |
| `deployment-and-guides.md` | Docker, the `nubjs/setup-nub` GitHub Action, and migration/integration guides (Bun, Turborepo, Vite) |

Guidance targets **nub 0.6.0**. Nub augments stock Node.js via Node's own extension surfaces; it
ships no patched Node and adds zero nub-specific runtime APIs.

## Install

Claude Code marketplace:

```
/plugin marketplace add yamlcrew/skills
/plugin install use-nubjs@yamlcrew
```

skills.sh (50+ agents):

```
npx skills add yamlcrew/skills/use-nubjs
```
