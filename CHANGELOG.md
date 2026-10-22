# Changelog

All notable changes to Whycommit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `requirements.txt` documenting the Node.js, npm, VS Code, git, Ollama, API key and packaging prerequisites.
- Tests for backticked function and file names in rule-based subjects and for omitting the scope when all files are in the repository root.

### Changed

- Rule-based subjects now wrap function, class and file names in backticks.
- Rule-based scope detection omits the scope when every changed file is in the repository root.
- README rewritten to match the current commands, providers, settings and architecture.
- Repository metadata and documentation now point to `https://github.com/inshrashaikh/Msgit`.

### Fixed

- The Whycommit generate button is visible in the Source Control title bar again.
- Prettier formatting so the CI `format:check` step passes.

## [0.2.0] - 2026-10-22

### Added

- Free offline mode with rule-based provider (no API key, no network)
- `auto` provider as default with fallback chain
- VS Code LM provider support (GitHub Copilot)
- Rule engine with heuristics for type/scope detection, English and Hinglish support
- "Why" input included in commit body
- First-run info message

### Changed

- Default provider changed from `anthropic` to `auto`
- README rewritten with comprehensive documentation

## [0.1.0] - 2026-10-22

The first public release.

### Added

- **Provider presets** for Anthropic, OpenAI, Google Gemini, Groq, OpenRouter,
  OpenCode Zen and Ollama, plus a `custom` preset for any other
  OpenAI-compatible endpoint. Choosing a preset fills in its base URL and a
  default model.
- **A unit test suite** (vitest) with 184 tests over the diff processor, the
  secret scanner, the commit style detector, the `.commitrc` validation, the
  prompt builder, the commit message sanitiser, the JSON helpers, the retry
  logic, the providers and the git service.
- **A secret scanner** that masks credentials in the staged diff before the
  request is sent to a provider.
- **A commit style detector** that derives Conventional Commits, Angular,
  gitmoji or plain style from the recent commit history.
- **`.commitrc` support** so a repository can pin down the allowed types,
  scopes, language, subject length and a sign-off trailer.
- **Retries with an exponential backoff** for rate limits (429) and server
  errors (5xx), with full cancellation support.
- **A one-time privacy notice** the first time a cloud provider is used, with
  a pointer to Ollama as the local alternative.
- **A security scanner** (`npm run security:scan`) that inspects the working
  tree and the whole git history for credentials and `.env` files.
- **A GitHub Actions workflow** that runs install, lint, typecheck, test and
  build on every push and pull request.
- **A marketplace icon**, categories, keywords and repository metadata.

### Changed

- The staged diff is now truncated with a budget that can never be exceeded by
  the per file truncation markers. Files that do not fit at all are reported
  in the header instead of being silently dropped.
- The `Commit message:` prefix is only stripped when it really is a preamble,
  so a subject such as `commit: add support` survives.
- `go.mod` is no longer treated as a lockfile, because it documents the
  dependencies of a module and is worth describing.
- The production bundle is minified, contains no source map and no comments
  apart from the copyright header.

### Security

- API keys are stored only in the VS Code `SecretStorage` and are never
  written to settings, logs, the repository or a `.env` file.
- The staged diff is scanned for credentials before it is sent to a provider.

[0.2.0]: https://github.com/inshrashaikh/Msgit/releases/tag/v0.2.0
[0.1.0]: https://github.com/inshrashaikh/Msgit/releases/tag/v0.1.0
[Unreleased]: https://github.com/inshrashaikh/Msgit/compare/v0.2.0...HEAD
