# Architecture

Whycommit is a small VS Code extension. This document describes how the pieces
fit together and where to change things.

## Layers

```
                       +-------------------------+
                       |  src/extension.ts        |
                       |  activation + commands   |
                       |  + the main flow         |
                       +------------+------------+
                                    |
     +---------------+--------------+---------------+----------------+
     |               |                              |                |
     v               v                              v                v
 src/config      src/git                        src/core          src/llm
 settings.ts     gitService.ts                  diffProcessor      provider.ts
                 (vscode.git API)               promptBuilder      anthropic.ts
                 (git CLI fallback)             secretScanner      openaiCompatible.ts
                                               styleDetector      ollama.ts
                 ui/privacyNotice.ts            commitrc.ts        http.ts
                 ui/statusBar.ts                utils/json.ts      retry.ts
                 ui/scmButton.ts
```

The rule of thumb: `core`, `config` and `utils` are **pure** — they never touch
the VS Code API and are therefore trivially unit testable. `git`, `llm` and `ui`
are the **adapters** that talk to the outside world.

## The main flow

`generateCommitMessage()` in `src/extension.ts` orchestrates everything:

1. **Pick the repository.** In a multi-root workspace the user chooses which
   repository to use. A repository without any commit, a detached HEAD and a
   repository without a remote are all handled by `GitService`.
2. **Privacy notice.** The first time a cloud provider is used, a one-time
   notice explains that the staged changes leave the machine.
3. **Read the API key** from `context.secrets`. The key never touches the
   settings, the logs or the repository.
4. **Read the staged diff** (`index` vs `HEAD`) through the `vscode.git` API.
   The git CLI is only used as a fallback.
5. **Process the diff** (`diffProcessor`): the diff is split per file, binary
   files and dependency lockfiles are dropped, and the remainder is truncated
   to the token budget.
6. **Scan for secrets** (`secretScanner`): credentials are masked before
   anything is sent.
7. **Build the prompt** (`promptBuilder`): the templates in `src/core/prompts`
   are rendered with the branch, the detected commit style, the `.commitrc`
   rules, the recent commits and the diff.
8. **Call the provider** (`llm/*`) with retries and cancellation.
9. **Sanitize the answer** (`utils/commitMessage`) and write it into
   `repository.inputBox.value`.

## The provider interface

Every backend implements a single interface:

```ts
interface LlmProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly requiresApiKey: boolean;
  generate(request: CompletionRequest, options: ProviderOptions): Promise<ProviderResult>;
}
```

`createProvider()` in `src/llm/provider.ts` maps a provider id onto an
implementation:

- `anthropic` → `AnthropicProvider` (Messages API)
- `ollama` → `OllamaProvider` (native `/api/chat`)
- everything else → `OpenAICompatibleProvider` (`/chat/completions`)

**Adding a new backend** therefore means:

1. Write a class that implements `LlmProvider` in `src/llm/`.
2. Add one `case` to `createProvider()`.
3. Add a preset to `PROVIDER_PRESETS` in `src/config/settings.ts` and to the
   `whycommit.provider` enum in `package.json`.

If the backend speaks the OpenAI protocol, step 1 is not even needed — a
preset is enough.

All failures are normalised into a `ProviderError` with a stable `kind`
(`no-api-key`, `unauthorized`, `rate-limit`, `network`, `timeout`, `server`,
`empty-response`, `cancelled`, `unknown`). `src/llm/retry.ts` uses those kinds
to decide what is worth retrying.

## The token budget

`diffProcessor` has to fit an arbitrary diff into `whycommit.maxDiffTokens`.

```
charBudget    = maxDiffTokens * 4
contentBudget = charBudget - header - block overhead - truncation markers
```

- Every file gets a share of `contentBudget` that is proportional to its size.
- A floor of `MIN_FILE_CHARS` (800) keeps small files readable.
- When the floor pushes the total over the budget, all shares are scaled down
  again.
- When even the file headers do not fit, the surplus files are dropped and
  reported in the header (`# N more file(s) omitted ...`).

The output length is therefore guaranteed to stay inside `charBudget`.

## Prompt templates

The templates live in `src/core/prompts` as plain text files and are inlined
into the bundle at build time (esbuild `text` loader). Their copyright header
uses `;` as the comment marker and is stripped by `stripFileHeader()` before a
template is sent to a model.

Placeholders use the `{{name}}` syntax and are filled in by `render()`.

## Security model

- API keys live only in `context.secrets` (the VS Code `SecretStorage`, backed
  by the OS keychain).
- The staged diff is the only data that is sent to a provider, and it is
  scanned for credentials first.
- The logger redacts anything that looks like a credential.
- The extension never writes to the repository, the index or any file. It only
  sets the text of the Source Control input box.

## Testing

`npm test` runs vitest. The `vscode` module is replaced by an in-memory mock
through an alias in `vitest.config.ts`, and the prompt templates are inlined
by a small vite plugin, so the tests exercise exactly the same code as the
bundle. The LLM and the git API are mocked as well.
