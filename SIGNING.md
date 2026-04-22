# Code Signing

Windows `.exe` binaries produced by the **Release** workflow are signed with
**Azure Trusted Signing** using OIDC federated credentials. No client secrets
live in the repo, and no signing cert is ever downloaded to the CI runner —
GitHub Actions gets a short-lived Azure token, the signing happens inside
Azure, and the signed binary comes back to the runner.

macOS `.dmg` and Android `.apk` in the current Release are **unsigned**.

## One-time setup

1. Open [shell.azure.com](https://shell.azure.com) (Bash) in the Azure
   subscription that owns the Trusted Signing account.

2. Clone the repo and run the setup script:

   ```bash
   git clone https://github.com/socrtwo/the-best-of-brock-cookbook.git
   cd the-best-of-brock-cookbook
   bash scripts/setup-azure-signing.sh
   ```

   The script is idempotent. It:
   - Creates (or reuses) an App Registration `brock-cookbook-signer`.
   - Adds two federated credentials for this repo:
     - `environment:release` — used by the Windows signing job.
     - `ref:refs/heads/main` — used by the OIDC smoke-test workflow.
   - Grants the App the **Artifact Signing Certificate Profile Signer** role,
     scoped to the specific certificate profile (not the whole account).

3. The script prints six values at the end. Paste them into the GitHub repo
   as **Variables** (not Secrets) under
   **Settings → Secrets and variables → Actions → Variables**:

   | Variable | Source |
   |---|---|
   | `AZURE_CLIENT_ID`       | App Registration client (application) ID |
   | `AZURE_TENANT_ID`       | `99dd7dad-5263-44fc-aea5-63c220ebcd48` |
   | `AZURE_SUBSCRIPTION_ID` | `5b2f1523-5925-4630-a326-22610b97db02` |
   | `TS_ENDPOINT`           | `https://eus.codesigning.azure.net/` |
   | `TS_ACCOUNT_NAME`       | `S2SetvicesCodeSigning` |
   | `TS_CERT_PROFILE`       | `GitHubAppSigner752` |

4. Create the `release` environment in
   **Settings → Environments → New environment → `release`**.
   The Windows job in `release.yml` is gated on this environment; the
   federated credential is scoped to it, so signing only happens for jobs
   that explicitly opt in.

## Verify it works (no signing consumed)

Go to **Actions → Verify OIDC → Run workflow**. Success output looks like:

```
Authenticated as:
Name                    ... user
brock-cookbook-signer   ... ServicePrincipal

OIDC plumbing works. Ready to sign.
```

If it fails with `AADSTS70021: No matching federated identity record found`,
the subject claim your workflow emitted isn't in the fed cred list. Most
common cause: the workflow was run from a branch other than `main` without
an `environment:` gate. Re-run the setup script — it's idempotent.

## Sign a release

```bash
git tag v1.0.0
git push --tags
```

The **Release** workflow will:
1. Build unsigned `.exe` on a `windows-latest` runner.
2. `azure/login@v2` — get Azure OIDC token (no stored secret).
3. `azure/trusted-signing-action@v0.5.1` — send binaries to Azure,
   Azure signs them with your cert profile, signed `.exe`s return.
4. Build unsigned `.dmg` (macOS) and debug `.apk` (Android) in parallel.
5. Publish all artifacts + `TheBestofBrock.epub` to a new GitHub Release.

## Verify the signature on a released .exe

Download the `.exe` and inspect it:

```powershell
# PowerShell (Windows)
Get-AuthenticodeSignature .\TheBestOfBrock-Setup-1.0.0.exe | Format-List
```

You should see:

- **Status**: `Valid`
- **SignerCertificate.Subject**: starts with `CN=` your signer name
- **SignerCertificate.Issuer**: includes `Microsoft ID Verified CS EOC CA`
- **TimeStamperCertificate**: `timestamp.acs.microsoft.com`

Or, on macOS/Linux with `osslsigncode`:

```bash
osslsigncode verify -in TheBestOfBrock-Setup-1.0.0.exe
```

## Rotating / revoking access

- To revoke the GitHub repo's ability to sign:
  `az role assignment delete --assignee <AZURE_CLIENT_ID> --scope <cert-profile-scope>`
- To rotate the App entirely, delete the App Registration and re-run
  `setup-azure-signing.sh`. Update the `AZURE_CLIENT_ID` variable in GitHub
  afterwards. (The other five variables are unchanged.)

## Adding another repo

Add another federated credential for the same App — no new cert, no new
script run. In Cloud Shell:

```bash
az ad app federated-credential create \
  --id <AZURE_CLIENT_ID> \
  --parameters '{
    "name":      "gh-OTHERREPO-release-env",
    "issuer":    "https://token.actions.githubusercontent.com",
    "subject":   "repo:OWNER/OTHERREPO:environment:release",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

Reuse the same six GitHub Variables in the new repo.

## Scope of trust

The App Registration this script creates has:
- **Zero** client secrets. OIDC federation only.
- **One** role assignment, on a single certificate profile (least privilege).
- **Two** federated credentials, both scoped to this exact repo.

That means: even if a GitHub Actions secret were stolen, an attacker could
not sign binaries — they'd need to push code to this repo's `main` (smoke
test, which can't actually sign — the role assignment is only exercised by
the release flow) or the `release` environment (which requires repo write
access anyway).
