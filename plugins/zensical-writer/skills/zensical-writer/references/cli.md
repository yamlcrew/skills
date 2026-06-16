# CLI reference

```sh
zensical COMMAND [OPTIONS] [ARGS]...
```

General help: `zensical --help`. Command help: `zensical <command> --help`.

There are **three** commands: `new`, `build`, `serve`.

## `zensical new`

```sh
zensical new [OPTIONS] PROJECT_DIRECTORY
```

Scaffolds a new project at `PROJECT_DIRECTORY` (created if missing; `.` for the current directory).
Does **not** overwrite: errors if `zensical.toml` exists, leaves other existing files untouched. No
extra options yet. Creates `.github/workflows/docs.yml`, `docs/index.md`, `docs/markdown.md`, and
`zensical.toml`.

## `zensical build`

```sh
zensical build [OPTIONS]
```

Builds the static site into `site_dir` (default `site/`).

| Option | Short | Description |
|---|---|---|
| `--config-file` | `-f` | Path to the config file. |
| `--clean` | `-c` | Clean the cache. |
| `--strict` | `-s` | Strict mode — fail on warnings (broken links/refs). |
| `--help` | | Show help and exit. |

`zensical build --clean` is the standard CI invocation.

## `zensical serve`

```sh
zensical serve [OPTIONS]
```

Starts the preview server at `http://localhost:8000` with live reload. **Preview only** — not a
production server.

| Option | Short | Description |
|---|---|---|
| `--config-file` | `-f` | Path to the config file. |
| `--open` | `-o` | Open the preview in the default browser. |
| `--dev-addr <IP:PORT>` | `-a` | Bind address/port (default `localhost:8000`). |
| `--help` | | Show help and exit. |

## Config-file detection

When `--config-file` is omitted, `build` and `serve` look for a config file in this order:

1. `zensical.toml`
2. `mkdocs.yml`
3. `mkdocs.yaml`

If none is found, the command errors.

## Differences from the MkDocs CLI

Carried-over MkDocs habits that **don't** apply:

- **No `gh-deploy`** — use a CI workflow (see `getting-started.md`).
- **No `get-deps`** — declare dependencies explicitly (e.g. in `pyproject.toml`).
- `build`/`serve` **drop** `--theme`/`-t`, `--use-directory-urls`/`--no-directory-urls`, and
  `--site-dir`. Set these in the config file (`[project.theme]`, `use_directory_urls`, `site_dir`).
- `serve --dirty` is **ignored** — Zensical's caching makes it unnecessary.
