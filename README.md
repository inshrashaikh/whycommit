# Whycommit

**Write good commit messages without thinking about them.**

Whycommit reads the changes you have **staged** in git, sends them to an LLM
(Anthropic Claude, OpenAI or any OpenAI-compatible endpoint, or a local Ollama
model) and writes a meaningful Conventional Commits message straight into the
Source Control input box.

---

## Features

- **Staged-changes only.** Whycommit never looks at unstaged or untracked files.
- **One click.** A button in the Source Control title bar, or `Ctrl+Shift+P` →
  _Whycommit: Generate Commit Message_.
- **Three providers, one interface.** Anthropic Claude (default), OpenAI /
  any OpenAI-compatible `baseUrl`, and a local Ollama server.
- **Secrets stay secret.** API keys live only in the VS Code `SecretStorage`.
  They are never written to settings, logs, the repository or a `.env` file.
- **Diff aware.** Binary files and dependency lockfiles are skipped, huge diffs
  are truncated to a token budget, and a statistics header keeps the model
  oriented even when parts of the diff had to be cut.
- **Context aware.** The current branch and your recent commit messages are
  used as a style reference, so the output matches how _you_ write commits.
- **English or Hinglish.** Pick the language of the generated message.

## Requirements

- VS Code `^1.85.0`
- The built-in **Git** extension (`vscode.git`) — it is bundled with VS Code.
- An API key for Anthropic or OpenAI, **or** a running Ollama server.

## Getting started

1. Install the extension (or open this folder in VS Code and press `F5`).
2. Configure the provider in your settings:

   ```jsonc
   {
     "whycommit.provider": "anthropic", // anthropic | openai | ollama
     "whycommit.model": "", // empty = provider default
     "whycommit.baseUrl": "", // empty = provider default
     "whycommit.maxDiffTokens": 12000,
     "whycommit.language": "english", // english | hinglish
   }
   ```

3. Store the API key with the command **Whycommit: Set API Key**
   (`Ctrl+Shift+P`). The key is written to the OS keychain through the VS Code
   `SecretStorage`.
4. Stage some changes (`git add ...`).
5. Click the ✨ button in the Source Control title bar (or run
   **Whycommit: Generate Commit Message**).
6. The generated message appears in the SCM input box — review it and commit.

### Using Ollama (fully local)

```bash
ollama pull llama3.2
ollama serve
```

Then set `"whycommit.provider": "ollama"`. The default `baseUrl` is
`http://localhost:11434` and no API key is required.

### Using an OpenAI-compatible endpoint

```jsonc
{
  "whycommit.provider": "openai",
  "whycommit.baseUrl": "https://your-gateway.example.com/v1",
  "whycommit.model": "your-model-id",
}
```

Any server that implements `POST {baseUrl}/chat/completions` works.

## Commands

| Command                              | Description                                     |
| ------------------------------------ | ----------------------------------------------- |
| `Whycommit: Generate Commit Message` | Generates a message from the staged changes.    |
| `Whycommit: Set API Key`             | Stores / replaces / removes a provider API key. |

## Settings

| Setting                       | Type    | Default     | Description                                            |
| ----------------------------- | ------- | ----------- | ------------------------------------------------------ |
| `whycommit.provider`          | string  | `anthropic` | `anthropic`, `openai` or `ollama`.                     |
| `whycommit.model`             | string  | `""`        | Model id. Empty uses the provider default.             |
| `whycommit.baseUrl`           | string  | `""`        | API base URL. Empty uses the provider default.         |
| `whycommit.maxDiffTokens`     | number  | `12000`     | Approximate token budget for the staged diff.          |
| `whycommit.language`          | string  | `english`   | `english` or `hinglish`.                               |
| `whycommit.temperature`       | number  | `0.3`       | Sampling temperature.                                  |
| `whycommit.maxOutputTokens`   | number  | `512`       | Maximum length of the generated message.               |
| `whycommit.recentCommitCount` | number  | `10`        | How many recent commits are used as a style reference. |
| `whycommit.showStatusBar`     | boolean | `true`      | Show the Whycommit status bar item.                    |

## Architecture

```
src/
├── extension.ts            Activation, command wiring and the main flow
├── config/settings.ts      Reads the `whycommit.*` settings
├── git/gitService.ts       Wraps the built-in `vscode.git` extension API
├── llm/
│   ├── provider.ts         The shared `LlmProvider` interface + factory
│   ├── anthropic.ts        Anthropic Messages API
│   ├── openaiCompatible.ts OpenAI / any OpenAI-compatible endpoint
│   ├── ollama.ts           Local (or remote) Ollama server
│   └── http.ts             Shared JSON transport and error mapping
├── core/
│   ├── diffProcessor.ts    Splits, filters and truncates the staged diff
│   ├── promptBuilder.ts    Renders the prompt templates
│   └── prompts/            system.txt and commit.txt
├── ui/
│   ├── statusBar.ts        Status bar item
│   └── scmButton.ts        Source Control title bar button state
├── utils/
│   ├── logger.ts           Output channel with secret redaction
│   └── commitMessage.ts    Cleans up the raw model response
└── features/               Placeholder for upcoming features
```

The **flow** is:

```
staged diff (vscode.git API)
  -> diffProcessor  (skip binary/lockfiles, truncate to the token budget)
  -> promptBuilder  (system.txt + commit.txt + branch + recent commits)
  -> LlmProvider    (Anthropic | OpenAI-compatible | Ollama)
  -> sanitizeCommitMessage
  -> repo.inputBox.value
```

Adding a new backend means writing one class that implements `LlmProvider` and
adding one `case` to `createProvider` in `src/llm/provider.ts`.

### Security model

- API keys are stored **only** in `context.secrets` (the VS Code `SecretStorage`,
  backed by the OS keychain).
- The logger redacts anything that looks like a credential before it is written
  to the output channel.
- The extension reads the diff through the git API and never writes to the
  repository, the index or any file.

## Development

```bash
npm install       # install the toolchain
npm run build     # bundle to out/extension.js (production)
npm run watch     # rebuild on change
npm run typecheck # strict TypeScript check
npm run lint      # ESLint
npm run format    # Prettier
npm test          # runs the type check (test suite is not written yet)
npm run package   # build and produce a .vsix
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
