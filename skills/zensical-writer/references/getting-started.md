# Getting started

Install Zensical, scaffold a project, preview it, build it, and publish it.

## Installation

Zensical is a Python package (Rust + Python under the hood). Use a virtual environment.

### pip (macOS / Linux)

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install zensical
```

### pip (Windows)

```sh
python -m venv .venv
.venv\Scripts\activate
pip install zensical
```

> Depending on your Python install you may need `python3` or `py -3`.

### uv

```sh
uv init
uv add --dev zensical
uv run zensical
```

When Zensical is a project dependency, always run it via `uv run` or activate the project's venv.

### conda / Mamba (conda-forge — third-party)

```sh
conda create -n zensical python=3.14
conda activate zensical
conda install -c conda-forge zensical
```

The conda-forge feedstock is community-maintained; the official packages are on PyPI.

### Docker

An official Docker image exists for **previews and builds in containers** (not for hosting the site).
See the image's instructions on Docker Hub.

## Create a new project

```sh
zensical new [OPTIONS] PROJECT_DIRECTORY
```

`zensical new .` scaffolds in the current directory. The path is created if it doesn't exist. The
command **won't overwrite** files: it errors if `zensical.toml` already exists, and leaves any other
pre-existing files untouched. (`new` has no extra options yet — `--help` to confirm.)

Generated structure:

```sh
.
├─ .github/workflows
│  └─ docs.yml          # GitHub Actions workflow to build + deploy to GitHub Pages
├─ docs/
│  ├─ index.md          # starting points
│  └─ markdown.md
└─ zensical.toml        # project configuration (with commented example settings)
```

- `zensical.toml` — configuration; see `configuration.md`.
- `docs/` — your Markdown sources (change with `docs_dir`).
- `.github/` — a ready CI workflow; edit it for your platform or delete it if unused.

## Preview (local server)

```sh
zensical serve [OPTIONS]
```

Serves the site at `http://localhost:8000` and auto-reloads the open page as you edit sources.

| Option | Short | Description |
|---|---|---|
| `--config-file` | `-f` | Path to the config file to use. |
| `--open` | `-o` | Open the preview in the default browser. |
| `--dev-addr <IP:PORT>` | `-a` | Bind address and port (default `localhost:8000`). |
| `--help` | | Show help and exit. |

The built-in server is **for preview only** — use nginx/Apache/etc. for production.

## Build

```sh
zensical build [OPTIONS]
```

Generates the static site into the configured `site_dir` (default `site/`).

| Option | Short | Description |
|---|---|---|
| `--config-file` | `-f` | Path to the config file to use. |
| `--clean` | `-c` | Clean the cache. |
| `--strict` | `-s` | Enable strict mode (fail on warnings — broken links/refs). |
| `--help` | | Show help and exit. |

`zensical build --clean` is the common CI variant. Use `--strict` to catch problems before deploy.

## Publish

### GitHub Pages (GitHub Actions)

`.github/workflows/docs.yml`:

```yaml
name: Documentation
on:
  push:
    branches:
      - master
      - main
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/configure-pages@v5
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v5
        with:
          python-version: 3.x
      - run: pip install zensical
      - run: zensical build --clean
      - uses: actions/upload-pages-artifact@v4
        with:
          path: site
      - uses: actions/deploy-pages@v4
        id: deployment
```

The site appears at `<username>.github.io/<repository>`.

### GitLab Pages (GitLab CI)

`.gitlab-ci.yml`:

```yaml
pages:
  stage: deploy
  image: python:latest
  script:
    - pip install zensical
    - zensical build --clean
  pages:
    publish: site
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

Untick "Use unique domain" in GitLab Pages settings for a production deployment.

> **CI caching:** the Zensical team currently recommends **not** relying on caches in CI (`--clean`)
> while caching internals are still being revised.

Any static host works — `build` produces a self-contained `site/` directory you can serve from a CDN
or your own web server.

> **Official channels are PyPI only** (`pip`/`uv`). conda-forge is community-run. There's no
> `cargo install` — the Rust core ships inside the Python package while Python Markdown is still a
> dependency.

## Upgrade

Upgrade the package the same way you installed it, e.g. `pip install --upgrade zensical` (or
`uv add --dev zensical@latest`). The team deliberately keeps **user-facing changes (config + CLI)
minimal** across `0.0.x`, so upgrades should not break your `zensical.toml` or commands — but the
internal API still changes, so skim the PyPI / GitHub release notes.

**Troubleshooting after an upgrade:** if a build misbehaves, first clear the build cache with
`zensical build --clean` (or `zensical serve` after a clean build) before looking elsewhere.

## Browser support

Full support (all features, no degradation): **Chrome 49+**, **Safari 10+**, **Edge 79+**,
**Firefox 53+**, **Opera 36+** — together ~93% of global usage. Zensical relies on modern CSS (custom
properties, mask images, `:is()`) that isn't fully polyfillable, so older browsers may degrade. Check
your own audience's browser distribution.
