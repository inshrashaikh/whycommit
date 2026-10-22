# Whycommit

Generate meaningful Git commit messages from your staged changes. Whycommit works offline with no API key by default and can optionally use a local Ollama model, GitHub Copilot through the VS Code Language Model API, or a cloud provider.

![Version](https://img.shields.io/badge/version-0.2.0-blue) ![License](https://img.shields.io/badge/license-Source--available-red) ![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue)

## Features

- **Generate from staged changes** - one command or the Source Control title bar button writes a Conventional Commits message into the SCM input box.
- **Free offline mode** - the `rulebased` provider is deterministic and makes no network requests.
- **Auto provider** - `auto` checks for Ollama and stored API keys, tries VS Code Language Models, and falls back to the rule-based provider.
- **Optional AI providers** - Anthropic, OpenAI, Gemini, Groq, OpenRouter, OpenCode Zen, Ollama and VS Code LM.
- **Style-aware prompts** - recent commit subjects are used as a style reference for AI providers.
- **`.commitrc` support** - pin allowed types, scopes, language, subject length and sign-off.
- **Secret scanning** - credentials in the staged diff are redacted before anything is sent to a remote provider.
- **Diff budgeting** - large staged diffs are truncated to the configured token budget.
- **Status bar and output log** - see the active provider/model and inspect the extension log.
- **Privacy notice** - shown once before the first cloud request.

## Requirements

See [requirements.txt](requirements.txt) for the plain-text prerequisite list.

- **VS Code**: ^1.85.0 (see `engines` in [package.json](package.json))
- **Node.js**: >= 18 (only needed for building from source)
- **npm**: >= 9
- **git**: >= 2.30
- Optional: **Ollama** with a model such as `llama3.2`
- Optional: API keys for Anthropic, OpenAI, Gemini, Groq, OpenRouter or OpenCode Zen
- Optional: **@vscode/vsce** for packaging a `.vsix`

npm dependencies are declared in [package.json](package.json) and pinned in `package-lock.json`.

## Installation

### From a `.vsix`

```bash
code --install-extension whycommit-0.2.0.vsix
```

### From source

```bash
git clone https://github.com/inshrashaikh/Msgit.git
cd Msgit
npm install
npm run build
```

Open the folder in VS Code and press `F5` to launch the Extension Development Host. To package the extension:

```bash
npm run package
```

## Quick start (4 steps, no API key needed)

1. **Open a Git repository** in VS Code.
2. **Stage your changes** with `git add ...`.
3. **Generate** with `Whycommit: Generate Commit Message` from the Command Palette, or click the sparkle button in the Source Control title bar.
4. **Review** the message in the SCM input box and commit.

The default `auto` provider falls back to the offline rule-based engine when no Ollama model or API key is available.

## Usage

| Command                            | Command ID                 | Description                                                                |
| ---------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| Whycommit: Generate Commit Message | `whycommit.generate`       | Generate a message from the staged diff and write it to the SCM input box. |
| Whycommit: Select Provider         | `whycommit.selectProvider` | Pick a provider preset and fill in its base URL and default model.         |
| Whycommit: Set API Key             | `whycommit.setApiKey`      | Store, replace or remove a provider API key in VS Code SecretStorage.      |
| Whycommit: Show Output Log         | `whycommit.showOutput`     | Open the Whycommit output channel.                                         |

The generate button appears in the Source Control title bar when the active provider is Git.

## Settings

| Setting                       | Default   | Description                                                                                                                          |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `whycommit.provider`          | `auto`    | Provider: `auto`, `rulebased`, `vscode-lm`, `anthropic`, `openai`, `gemini`, `groq`, `openrouter`, `opencode`, `ollama` or `custom`. |
| `whycommit.model`             | `""`      | Model id sent to the provider. Empty uses the provider default.                                                                      |
| `whycommit.baseUrl`           | `""`      | Provider base URL. Empty uses the provider default.                                                                                  |
| `whycommit.maxDiffTokens`     | `12000`   | Approximate token budget for the staged diff.                                                                                        |
| `whycommit.language`          | `english` | Output language: `english` or `hinglish`.                                                                                            |
| `whycommit.temperature`       | `0.3`     | Sampling temperature.                                                                                                                |
| `whycommit.maxOutputTokens`   | `512`     | Maximum tokens in the generated message.                                                                                             |
| `whycommit.recentCommitCount` | `10`      | Number of recent commits used as a style reference.                                                                                  |
| `whycommit.maxRetries`        | `2`       | Retries for rate limits (429) and server errors (5xx) with exponential backoff.                                                      |
| `whycommit.showStatusBar`     | `true`    | Show the Whycommit status bar item.                                                                                                  |

### `.commitrc.json` example

```json
{
  "types": ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore"],
  "scopes": ["core", "api", "ui"],
  "maxLength": 72,
  "language": "english"
}
```

## Providers

| Provider     | Free/Paid         | Offline                        | Default model                 | Notes                                                             |
| ------------ | ----------------- | ------------------------------ | ----------------------------- | ----------------------------------------------------------------- |
| `auto`       | Free              | Yes (falls back to rule-based) | -                             | Default. Picks Ollama, a stored key, VS Code LM, then rule-based. |
| `rulebased`  | Free              | Yes                            | `rule-based`                  | Deterministic heuristics, no network, no setup.                   |
| `vscode-lm`  | Free with Copilot | No                             | -                             | Uses GitHub Copilot through the VS Code Language Model API.       |
| `anthropic`  | Paid              | No                             | `claude-sonnet-4-5`           | Requires an Anthropic API key.                                    |
| `openai`     | Paid              | No                             | `gpt-4o`                      | Requires an OpenAI API key.                                       |
| `gemini`     | Paid              | No                             | `gemini-2.5-flash`            | Uses Gemini's OpenAI-compatible endpoint.                         |
| `groq`       | Paid              | No                             | `llama-3.3-70b-versatile`     | OpenAI-compatible endpoint.                                       |
| `openrouter` | Paid              | No                             | `anthropic/claude-sonnet-4.5` | OpenAI-compatible endpoint.                                       |
| `opencode`   | Varies            | No                             | `claude-sonnet-4-5`           | OpenCode Zen at `https://opencode.ai/zen/v1`.                     |
| `ollama`     | Free              | Yes                            | `llama3.2`                    | Runs locally, so nothing leaves your machine.                     |
| `custom`     | Varies            | No                             | -                             | Any OpenAI-compatible endpoint.                                   |

API keys are stored only in VS Code SecretStorage through `context.secrets`; they are never written to settings, logs or the repository.

## Architecture

### Flow

```text
Staged diff -> GitService -> Diff processor (token budget) -> Secret scanner (redact)
-> Style detection + .commitrc -> PromptBuilder -> Provider (auto: Ollama / VS Code LM / rulebased / configured)
-> Sanitize -> SCM input box
```

### Folder tree

```text
src/
├── extension.ts          # Activation, commands and the generation flow
├── config/settings.ts    # Settings, provider presets and resolution
├── git/gitService.ts     # vscode.git wrapper, diff, history and .commitrc
├── llm/                  # Providers: rulebased, vscode-lm, anthropic, openai-compatible, ollama
├── core/
│   ├── ruleEngine/       # Diff parser, classifier, symbol parser, message builder
│   ├── commitrc.ts       # .commitrc parsing and validation
│   ├── diffProcessor.ts  # Token-budgeted diff processing
│   ├── promptBuilder.ts  # Prompt templates and rendering
│   ├── secretScanner.ts  # Credential detection and redaction
│   └── styleDetector.ts  # Commit style detection from history
├── ui/                   # Status bar, SCM button, privacy notice
├── utils/                # Logger, commit message sanitizer, JSON helpers
└── types/                # Local typings
test/                     # Vitest unit tests
scripts/                  # Security scan
```

### Adding a provider

1. Add the id to `ProviderId` in `src/config/settings.ts`.
2. Add a preset to `PROVIDER_PRESETS` and to `PROVIDER_ORDER`.
3. Implement `LlmProvider` in `src/llm/` or extend `OpenAICompatibleProvider`.
4. Wire it up in `createProvider()` in `src/llm/provider.ts`.
5. Add tests.

## Privacy and security

- **Offline by default** - the rule-based provider sends nothing.
- **Secret redaction** - the staged diff is scanned and credentials are masked before any remote request.
- **Secure storage** - API keys live in VS Code SecretStorage only.
- **Redacted logs** - secrets are not written to the output log.
- **Privacy notice** - shown once before the first cloud request.
- **Workspace Trust** - the extension does not run in Restricted Mode.

## Troubleshooting

- **Restricted Mode / Workspace Trust** - Whycommit refuses to run in untrusted workspaces. Trust the workspace and reload VS Code.
- **No Git repository** - open a folder that contains a `.git` directory. In a multi-root workspace, pick the repository when prompted.
- **No staged changes** - stage files with `git add ...` first; the extension only reads the staged diff.
- **No API key** - run `Whycommit: Set API Key`, or choose `rulebased` / `ollama` for a free option.
- **Ollama not running** - start Ollama (`ollama serve`) or switch provider.
- **Rate limits** - requests are retried with exponential backoff; try again later.
- **Generic message** - add more context or switch to an AI provider.

## Development

| Script                  | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `npm run build`         | Build the production bundle with esbuild.      |
| `npm run watch`         | Rebuild on changes.                            |
| `npm test`              | Run the Vitest suite.                          |
| `npm run test:coverage` | Run tests with coverage.                       |
| `npm run lint`          | Run ESLint.                                    |
| `npm run typecheck`     | Run TypeScript type checking.                  |
| `npm run format:check`  | Check formatting with Prettier.                |
| `npm run security:scan` | Scan the working tree and history for secrets. |
| `npm run package`       | Build and package the `.vsix` with vsce.       |

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Contributing

Source-available. Issues are welcome. Code reuse is not permitted.

## License

Source-available. All rights reserved. Copying, redistribution or reuse is not permitted.

## Author

Shaikh Inshra
