# Whycommit

**Write good commit messages without thinking about them.**

Whycommit reads the changes you have **staged** in git, sends them to an LLM
(Anthropic Claude, OpenAI, Gemini, Groq, OpenRouter, OpenCode Zen, a local
Ollama model or any other OpenAI-compatible endpoint) and writes a meaningful
Conventional Commits message straight into the Source Control input box.

---

## Features

- **Staged-changes only.** Whycommit never looks at unstaged or untracked files.
- **One click.** A button in the Source Control title bar, or `Ctrl+Shift+P` →
  _Whycommit: Generate Commit Message_.
- **Seven provider presets, one interface.** Pick a preset and the base URL and
  a sensible default model are filled in for you.
- **Secrets stay secret.** API keys live only in the VS Code `SecretStorage`.
  They are never written to settings, logs, the repository or a `.env` file.
- **Your diff is scanned before it leaves the machine.** Credentials that are
  staged by accident are masked before the request is sent.
- **Diff aware.** Binary files and dependency lockfiles are skipped, huge diffs
  are truncated to a token budget, and a statistics header keeps the model
  oriented even when parts of the diff had to be cut.
- **Context aware.** The current branch, the detected commit style and your
  recent commit messages are used as a reference, so the output matches how
  _you_ write commits.
- **Repository conventions.** A `.commitrc` file can pin down the allowed types,
  scopes, language and subject length.
- **English or Hinglish.** Pick the language of the generated message.
- **Resilient.** Rate limits (429) and server errors (5xx) are retried with an
  exponential backoff, and every request can be cancelled.
- **Works everywhere.** Empty repositories, detached HEADs, repositories without
  a remote and multi-root workspaces are all handled.

## Requirements

- VS Code `^1.85.0`
- The built-in **Git** extension (`vscode.git`) — it is bundled with VS Code.
- An API key for a cloud provider, **or** a running Ollama server.

## Getting started

1. Install the extension (or open this folder in VS Code and press `F5`).
2. Choose a provider preset with the command **Whycommit: Select Provider**
   (`Ctrl+Shift+P`). The command fills in the base URL and the default model.
3. Store the API key with the command **Whycommit: Set API Key**. The key is
   written to the OS keychain through the VS Code `SecretStorage`.
4. Stage some changes (`git add ...`).
5. Click the ✨ button in the Source Control title bar (or run
   **Whycommit: Generate Commit Message**).
6. The generated message appears in the SCM input box — review it and commit.

### Manual configuration

Everything the presets do can also be done by hand:

```jsonc
{
  "whycommit.provider": "anthropic", // see the table below
  "whycommit.model": "", // empty = provider default
  "whycommit.baseUrl": "", // empty = provider default
  "whycommit.maxDiffTokens": 12000,
  "whycommit.language": "english", // english | hinglish
}
```

## Provider presets

| Preset         | Base URL                                                  | Default model                 | API key |
| -------------- | --------------------------------------------------------- | ----------------------------- | ------- |
| Anthropic      | `https://api.anthropic.com/v1`                            | `claude-sonnet-4-5`           | yes     |
| OpenAI         | `https://api.openai.com/v1`                               | `gpt-4o`                      | yes     |
| Gemini         | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash`            | yes     |
| Groq           | `https://api.groq.com/openai/v1`                          | `llama-3.3-70b-versatile`     | yes     |
| OpenRouter     | `https://openrouter.ai/api/v1`                            | `anthropic/claude-sonnet-4.5` | yes     |
| OpenCode Zen   | `https://opencode.ai/zen/v1`                              | `claude-sonnet-4-5`           | yes     |
| Ollama (local) | `http://localhost:11434`                                  | `llama3.2`                    | no      |
| Custom         | _your endpoint_                                           | _your model_                  | yes     |

Every OpenAI-compatible preset (OpenAI, Gemini, Groq, OpenRouter, OpenCode Zen
and Custom) talks to `POST {baseUrl}/chat/completions`.

### Using Ollama (fully local)

```bash
ollama pull llama3.2
ollama serve
```

Then run **Whycommit: Select Provider** → **Ollama (local)**. No API key is
required and nothing leaves your machine.

### Using any other OpenAI-compatible endpoint

Pick **Custom** in **Whycommit: Select Provider** and enter the base URL and the
model id. Anything that implements `POST {baseUrl}/chat/completions` works,
including LiteLLM, vLLM, a corporate gateway or a remote Ollama host.

## Commands

| Command                              | Description                                         |
| ------------------------------------ | --------------------------------------------------- |
| `Whycommit: Generate Commit Message` | Generates a message from the staged changes.        |
| `Whycommit: Select Provider`         | Picks a preset and fills in its base URL and model. |
| `Whycommit: Set API Key`             | Stores / replaces / removes a provider API key.     |
| `Whycommit: Show Output Log`         | Opens the output channel with the extension log.    |

## Settings

| Setting                       | Type    | Default     | Description                                               |
| ----------------------------- | ------- | ----------- | --------------------------------------------------------- |
| `whycommit.provider`          | string  | `anthropic` | The provider preset (see the table above).                |
| `whycommit.model`             | string  | `""`        | Model id. Empty uses the provider default.                |
| `whycommit.baseUrl`           | string  | `""`        | API base URL. Empty uses the provider default.            |
| `whycommit.maxDiffTokens`     | number  | `12000`     | Approximate token budget for the staged diff.             |
| `whycommit.language`          | string  | `english`   | `english` or `hinglish`.                                  |
| `whycommit.temperature`       | number  | `0.3`       | Sampling temperature.                                     |
| `whycommit.maxOutputTokens`   | number  | `512`       | Maximum length of the generated message.                  |
| `whycommit.recentCommitCount` | number  | `10`        | How many recent commits are used as a style reference.    |
| `whycommit.maxRetries`        | number  | `2`         | How often a failed request is retried (429 and 5xx only). |
| `whycommit.showStatusBar`     | boolean | `true`      | Show the Whycommit status bar item.                       |

## Repository conventions (`.commitrc`)

Drop a `.commitrc` (or `.commitrc.json`) into the root of a repository to pin
down the conventions Whycommit has to follow:

```json
{
  "types": ["feat", "fix", "chore"],
  "scopes": ["api", "ui"],
  "language": "english",
  "maxSubjectLength": 72,
  "signOff": true
}
```

Every field is optional. An invalid file is ignored and reported in the output
channel, so a typo can never break the extension.

## Privacy

- The **staged diff** is the only thing that is sent to the provider. Unstaged
  and untracked files are never read.
- The diff is scanned for credentials first. Anything that looks like a key,
  a token, a private key or a password is masked before the request is sent,
  and you get a warning when that happens.
- The first time a **cloud** provider is used, a one-time notice explains that
  your code leaves the machine and points at **Ollama** as the local
  alternative.
- **API keys are never transmitted.** They are read from the VS Code
  `SecretStorage` and sent as an authorization header, nothing else.
- Nothing is written to your repository, the index or any file. Whycommit only
  sets the text of the Source Control input box.
- The output channel redacts anything that looks like a credential before it
  is written.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the details. In short:

```
staged diff (vscode.git API)
  -> diffProcessor  (skip binary/lockfiles, truncate to the token budget)
  -> secretScanner  (mask credentials before anything leaves the machine)
  -> promptBuilder  (system.txt + commit.txt + branch + style + .commitrc)
  -> LlmProvider    (Anthropic | OpenAI-compatible | Ollama) with retries
  -> sanitizeCommitMessage
  -> repo.inputBox.value
```

## Development

```bash
npm install        # install the toolchain
npm run build      # bundle to out/extension.js (production, minified)
npm run watch      # rebuild on change
npm run typecheck  # strict TypeScript check
npm run lint       # ESLint
npm run format     # Prettier
npm test           # run the vitest suite
npm run package    # build and produce a .vsix
npm run security:scan  # scan the repository and the git history for secrets
```

### Running the extension (F5)

1. Open this folder in VS Code.
2. Make sure the Git extension is enabled (it is by default).
3. Press `F5` — or use the **Run and Debug** panel and pick
   **Run Whycommit**. A second VS Code window opens with the extension loaded.
4. The `npm: watch` task starts automatically and rebuilds `out/extension.js`
   whenever you change a file, so you only have to reload the Extension
   Development Host (`Ctrl+R`).
5. In the Extension Development Host, stage a change in the test repository and
   click the ✨ button in the Source Control view.

## License

<!-- prettier-ignore -->
**Source-available. All rights reserved. Copying, redistribution or reuse is not permitted.**

Copyright (c) 2026 Shaikh Inshra. This software and its source code are
proprietary. See [LICENSE](./LICENSE) for the full terms.
