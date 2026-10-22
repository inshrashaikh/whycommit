# Release checklist

Everything on this page is manual and has to be done by the maintainer. The
repository is **not** pushed automatically.

## 1. Prepare the release

```bash
npm install
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run security:scan
```

All of them have to pass. `npm run security:scan` must print
`RESULT: PASSED`.

## 2. Bump the version

The version lives in exactly one place: the `version` field of
`package.json`. Semantic versioning is used (`MAJOR.MINOR.PATCH`).

```bash
npm version 0.2.0 --no-git-tag-version
```

That updates `package.json` and `package-lock.json`. Then:

1. Add the release to `CHANGELOG.md` under a new `## [x.y.z]` heading.
2. Update the link at the bottom of `CHANGELOG.md`.
3. Commit the change:

   ```bash
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "chore(release): bump the version to 0.2.0"
   ```

For a patch release only the `PATCH` part changes, for a new feature the
`MINOR` part, and for a breaking change the `MAJOR` part. A breaking change
also needs a note in `CHANGELOG.md` that says so explicitly.

## 3. Create the public GitHub repository

1. Go to <https://github.com/new>.
2. Name it `whycommit`.
3. Choose **Public**.
4. **Do not** initialise it with a README, a `.gitignore` or a licence — the
   local repository already has a history.
5. Create it.

Then add the remote and push:

```bash
git remote add origin https://github.com/<YOUR_USER>/whycommit.git
git push -u origin main
```

The repository is proprietary. Publishing it under an open source licence is
not allowed — keep the `LICENSE` file exactly as it is.

## 4. Create the Marketplace publisher

1. Sign in to <https://marketplace.visualstudio.com/>.
2. Open **Profile** → **Publisher** and choose **Create publisher**.
3. Pick an Azure DevOps organisation (personal Microsoft accounts are not
   supported), confirm the publisher name and the support email.
4. Fill in the publisher profile: a profile picture, a short description and
   the support links. The Marketplace requires these before the first publish.
5. Note the **publisher name** — it has to match the `publisher` field in
   `package.json`.

> The publisher name can only be set once. If you are not sure about the name,
> create a test publisher first, publish under it and change the `publisher`
> field later.

## 5. Create the Personal Access Token

1. Go to <https://marketplace.visualstudio.com/> → **User** → **Personal
   Access Tokens**.
2. Select the publisher that was created in step 4.
3. Choose **All accessible organizations** if the token should work for every
   organisation, or a single organisation.
4. Generate a token with the scopes:
   - **Manage Extensions** (mandatory, to publish)
   - **Get Publisher** (mandatory)
   - the scope for the organisation the publisher belongs to
5. Copy the token. **It is only shown once.** Store it in a password manager —
   never in the repository, never in a settings file.

## 6. Publish

Authenticate once:

```bash
npx @vscode/vsce login <PUBLISHER_NAME>
npx @vscode/vsce login --token <TOKEN>   # alternative, not recommended
```

Then publish:

```bash
npm run package                                  # build the .vsix
npx @vscode/vsce publish whycommit-0.2.0.vsix     # upload it
```

The upload takes a few minutes. The extension then appears in the Marketplace
and in the VS Code extension view within roughly an hour.

To publish a **pre-release** version, add a `prerelease` tag to the version in
`package.json` (`0.2.0-preview.1`) before publishing.

## 7. Verify

1. Open the extension page on the Marketplace and check that the icon, the
   README, the categories and the keywords are rendered.
2. Install the extension in a clean VS Code profile and run
   **Whycommit: Select Provider** and **Whycommit: Set API Key**.
3. Stage a change and run **Whycommit: Generate Commit Message**.

## 8. Tag the release

```bash
git tag -a v0.2.0 -m "Whycommit 0.2.0"
git push origin main --tags
```

The tag is what the `CHANGELOG.md` links point to.

## Later releases

The full loop for every follow-up release:

| Step | Command / action                                   |
| ---- | -------------------------------------------------- |
| 1    | change the code, `npm test`                        |
| 2    | `npm version <x.y.z> --no-git-tag-version`         |
| 3    | update `CHANGELOG.md`                              |
| 4    | `git commit -m "chore(release): bump the version"` |
| 5    | `npm run package`                                  |
| 6    | `npx @vscode/vsce publish whycommit-<x.y.z>.vsix`  |
| 7    | `git tag -a v<x.y.z> -m "Whycommit <x.y.z>"`       |
| 8    | `git push origin main --tags`                      |

The `publisher` field, the icon, the categories and the keywords only have to
be changed once. They live in `package.json` and are picked up by every
release automatically.
