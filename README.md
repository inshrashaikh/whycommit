# Whycommit

**Tagline:** Generate meaningful Git commit messages from your staged changes - free and offline by default, with optional AI providers.

![Version](https://img.shields.io/badge/version-0.2.0-blue) ![License](https://img.shields.io/badge/license-Source--available-red) ![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue) ![CI](https://img.shields.io/badge/CI-available-green)

## Why Whycommit?

Writing good commit messages is tedious. Whycommit analyzes your staged diff and generates a Conventional Commits message in seconds. It has a unique "Why" input idea - you can explain the reasoning and it gets included in the body. Best of all, it works offline with no API key required.

## Features

- **Generate message** - Create commit messages from staged changes with one command or SCM button
- **Free offline mode** - Rule-based provider works with no setup, no API key, no network
- **Auto provider** - Automatically picks the best available provider (rule-based, VS Code LM, or configured provider)
- **Style learning** - Learns from your recent commits (conventional, casing, emoji, tense)
- **"Why" input** - Add reasoning that appears as a "Why:" line in the commit body
- **.commitrc.json** - Respects allowed types/scopes and max length
- **Secret scanner** - Scans and redacts credentials before sending to remote providers
- **Smart split** - Group changes by folder and type
- **PR description** - Generate PR descriptions from changes
- **Quality check** - Validate commit message quality
- **Optional AI providers** - Use Anthropic, OpenAI, Gemini, Groq, OpenRouter, OpenCode Zen, Ollama, or VS Code LM if desired

## Demo

![Demo placeholder](docs/images/demo.gif)

Example:

```
Input diff (src/auth.ts):
+function login() { if(!user) return null; }

English output:
fix: fix auth

Body:
- update auth.ts

Hinglish output:
fix: fix auth

Body:
- Why: better security
```

## Requirements

- **VS Code**: ^1.85.0 (see [package.json](package.json))
- **Node.js**: >= 18 (LTS recommended) - see [requirements.txt](requirements.txt)
- **npm**: >= 9
- **git**: >= 2.30
- Optional: **Ollama** with a model like llama3.2
- Optional: API keys for Anthropic/OpenAI/Gemini/Groq/OpenRouter/OpenCode Zen
- Optional: **@vscode/vsce** for packaging

## Installation

### From the Marketplace (placeholder)
Search for "Whycommit" in the VS Code Extensions marketplace.

### From a .vsix
```bash
code --install-extension whycommit-0.2.0.vsix
```

### From source
```bash
git clone https://github.com/whycommit/whycommit.git
cd whycommit
npm install
npm run build
# Press F5 in VS Code to run Extension Development Host
```

## Quick start (4 steps, no key needed)

1. **Open a git repo** in VS Code
2. **Stage changes** with `git add ...`
3. **Generate**: Run `Whycommit: Generate Commit Message` from Command Palette or click the SCM button
4. **Done** - Message appears in the SCM input box. Works offline by default!

## Usage

| Command (Command Palette) | Command ID | Description |
|---|---|---|
| Whycommit: Generate Commit Message | `whycommit.generate` | Generate a commit message from staged changes |
| Whycommit: Set API Key | `whycommit.setApiKey` | Store/remove API keys securely in SecretStorage |
| Whycommit: Select Provider | `whycommit.selectProvider` | Choose provider and auto-fill baseUrl/model |
| Whycommit: Show Output | `whycommit.showOutput` | Show the extension log output |

The SCM button appears when in a git repository.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `whycommit.provider` | `auto` | Provider: auto, rulebased, vscode-lm, anthropic, openai, gemini, groq, openrouter, opencode, ollama, custom |
| `whycommit.model` | `""` | Model id (empty = provider default) |
| `whycommit.baseUrl` | `""` | Base URL (empty = provider default) |
| `whycommit.maxDiffTokens` | `12000` | Token budget for staged diff |
| `whycommit.language` | `english` | Output language: english or hinglish |
| `whycommit.temperature` | `0.2` | Sampling temperature |
| `whycommit.maxOutputTokens` | `512` | Max tokens in output |
| `whycommit.recentCommitCount` | `10` | Recent commits used for style learning |
| `whycommit.showStatusBar` | `true` | Show status bar item |
| `whycommit.maxRetries` | `2` | Retries on 429/5xx with exponential backoff |

### .commitrc.json example

```json
{
  "types": ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore"],
  "scopes": ["core", "api", "ui"],
  "maxLength": 72,
  "language": "english"
}
```

## Providers

| Provider | Free/Paid | Offline | Notes |
|---|---|---|---|
| `auto` | Free | Yes (falls back to rule-based) | Default. Uses rule-based if no key/Ollama, else tries VS Code LM or configured provider |
| `rulebased` | Free | Yes | Deterministic, no network, works with no setup |
| `vscode-lm` | Free (with Copilot) | No* | Uses GitHub Copilot via VS Code LM API if available |
| `anthropic` | Paid | No | Requires API key via `Whycommit: Set API Key` |
| `openai` | Paid | No | Requires API key |
| `gemini` | Paid | No | OpenAI-compatible endpoint |
| `groq` | Paid | No | OpenAI-compatible endpoint |
| `openrouter` | Paid | No | OpenAI-compatible endpoint |
| `opencode` | Varies | No | OpenCode Zen |
| `ollama` | Free | Yes | Runs locally, nothing leaves machine |
| `custom` | Varies | No | Any OpenAI-compatible endpoint |

*VS Code LM requires network/auth depending on provider.

API keys are stored securely in VS Code SecretStorage via `context.secrets`, never in settings or logs.

## Architecture

### Flow diagram

```
Staged diff -> GitService -> Secret scan (redact) -> Diff processor (budget) -> Style detection + .commitrc -> PromptBuilder -> Provider chain (auto: rulebased/vscode-lm/configured) -> Sanitize -> SCM input box
```

### Folder tree

```
src/
├── extension.ts        # Main entry, commands, flow
├── config/settings.ts  # Settings, presets, resolution
├── git/gitService.ts   # vscode.git wrapper + hardening
├── llm/                # Providers (anthropic, openaiCompatible, ollama, vscodeLm, ruleBased, retry, http)
├── core/               # Diff processing, prompts, secret scanner, style detector, commitrc, ruleEngine
├── ui/                 # Status bar, SCM button, privacy notice
├── utils/              # Logger, commit message sanitizer, JSON helpers
└── types/              # Local typings
test/                   # Vitest unit tests
```

### Adding a new provider
1. Add type to `ProviderId` in `src/config/settings.ts`
2. Add preset to `PROVIDER_PRESETS` and to `PROVIDER_ORDER`
3. Implement `LlmProvider` in `src/llm/` or extend `OpenAICompatibleProvider`
4. Update `createProvider()` in `src/llm/provider.ts`
5. Add tests

## Privacy and security

- **Offline by default**: Rule-based mode sends nothing
- **Secret redaction**: Staged diff scanned for credentials before sending to remote models
- **Secure storage**: API keys stored in VS Code SecretStorage only
- **Logging**: Secrets redacted from logs
- **Privacy notice**: Shown once for cloud providers

## Development

| Script | Description |
|---|---|
| `npm run build` | Build with esbuild (production) |
| `npm run watch` | Watch mode |
| `npm test` | Run vitest tests |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run package` | Build and package .vsix with vsce |

Debug with F5 (Extension Development Host). Tests run with `npm test`.

## Troubleshooting / FAQ

- **No staged changes**: Stage files with `git add` first
- **Key errors**: Use `Whycommit: Set API Key` to store/remove keys
- **Rate limits**: Automatic retry with exponential backoff; try again later
- **Ollama not running**: Start Ollama or switch provider
- **Message too generic**: Add more context or use "Why" input; rule-based uses heuristics from your diff

## Roadmap

- More language support
- Better symbol extraction
- Custom templates

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Contributing

Source-available. Issues welcome. Code reuse not permitted.

## License

Source-available. All rights reserved. Copying, redistribution or reuse is not permitted.

## Author

Shaikh Inshra
