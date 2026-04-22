#!/usr/bin/env bash
# setup-azure-signing.sh
#
# Idempotent setup of Azure Trusted Signing + GitHub Actions OIDC federated
# credentials for the the-best-of-brock-cookbook repo.
#
# Run this ONCE in Azure Cloud Shell (shell.azure.com) from an account that
# owns the subscription below. It:
#   1. Creates (or reuses) an App Registration for GitHub to impersonate.
#   2. Creates (or reuses) a Service Principal for that App.
#   3. Adds federated credentials so the GitHub repo can obtain tokens:
#        - release: signing job running in the "release" environment
#        - main:    smoke-test job on the main branch (for verify-oidc.yml)
#   4. Assigns "Artifact Signing Certificate Profile Signer" on the cert
#      profile scope (least-privilege — cannot sign with any other profile).
#   5. Prints the GitHub repo Variables to set.
#
# Safe to re-run: existing resources are left in place.

set -euo pipefail

# --------------------------------------------------------------------------
# Project-specific values (already filled in for this repo).
# --------------------------------------------------------------------------
readonly SUBSCRIPTION_ID="5b2f1523-5925-4630-a326-22610b97db02"
readonly TENANT_ID="99dd7dad-5263-44fc-aea5-63c220ebcd48"
readonly RESOURCE_GROUP="EXESigning"
readonly SIGNING_ACCOUNT="S2SetvicesCodeSigning"
readonly CERT_PROFILE="GitHubAppSigner752"
readonly LOCATION="eastus"

readonly GITHUB_OWNER="socrtwo"
readonly GITHUB_REPO="the-best-of-brock-cookbook"

readonly APP_NAME="brock-cookbook-signer"

# --------------------------------------------------------------------------
say()  { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m!!\033[0m %s\n' "$*" >&2; exit 1; }

command -v az >/dev/null || die "az CLI not found. Use Azure Cloud Shell."

say "Setting active subscription"
az account set --subscription "$SUBSCRIPTION_ID"

# 1. App Registration -------------------------------------------------------
say "Ensuring App Registration '$APP_NAME' exists"
APP_ID="$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv)"
if [[ -z "$APP_ID" || "$APP_ID" == "null" ]]; then
  APP_ID="$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)"
  say "Created App Registration: $APP_ID"
else
  say "Found existing App Registration: $APP_ID"
fi

# 2. Service Principal ------------------------------------------------------
say "Ensuring Service Principal exists for App"
SP_ID="$(az ad sp list --filter "appId eq '$APP_ID'" --query '[0].id' -o tsv)"
if [[ -z "$SP_ID" || "$SP_ID" == "null" ]]; then
  SP_ID="$(az ad sp create --id "$APP_ID" --query id -o tsv)"
  say "Created Service Principal: $SP_ID"
else
  say "Found existing Service Principal: $SP_ID"
fi

# 3. Federated credentials --------------------------------------------------
add_federated_cred() {
  local name="$1" subject="$2"
  local existing
  existing="$(az ad app federated-credential list \
    --id "$APP_ID" \
    --query "[?name=='$name'].name" -o tsv)"
  if [[ -n "$existing" ]]; then
    say "Federated credential '$name' already present"
    return
  fi
  say "Adding federated credential '$name' (subject: $subject)"
  az ad app federated-credential create --id "$APP_ID" --parameters "{
    \"name\":        \"$name\",
    \"issuer\":      \"https://token.actions.githubusercontent.com\",
    \"subject\":     \"$subject\",
    \"audiences\":   [\"api://AzureADTokenExchange\"],
    \"description\": \"GitHub Actions OIDC for $GITHUB_OWNER/$GITHUB_REPO ($name)\"
  }" >/dev/null
}

add_federated_cred \
  "gh-release-env" \
  "repo:$GITHUB_OWNER/$GITHUB_REPO:environment:release"

add_federated_cred \
  "gh-main-branch" \
  "repo:$GITHUB_OWNER/$GITHUB_REPO:ref:refs/heads/main"

add_federated_cred \
  "gh-master-branch" \
  "repo:$GITHUB_OWNER/$GITHUB_REPO:ref:refs/heads/master"

# 4. Role assignment --------------------------------------------------------
say "Granting 'Artifact Signing Certificate Profile Signer' on the cert profile"
SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.CodeSigning/codeSigningAccounts/$SIGNING_ACCOUNT/certificateProfiles/$CERT_PROFILE"

# Wait briefly for the SP to propagate to Azure AD
for _ in 1 2 3 4 5; do
  if az role assignment list --assignee "$APP_ID" --scope "$SCOPE" \
       --query "[?roleDefinitionName=='Artifact Signing Certificate Profile Signer'] | length(@)" -o tsv \
     | grep -q '^0$'; then
    az role assignment create \
      --assignee-object-id "$SP_ID" \
      --assignee-principal-type ServicePrincipal \
      --role "Artifact Signing Certificate Profile Signer" \
      --scope "$SCOPE" >/dev/null && break
  else
    say "Role already assigned"
    break
  fi
  warn "Retrying role assignment in 6s (AAD propagation)"
  sleep 6
done

# 5. Summary ----------------------------------------------------------------
cat <<EOF

\033[32mAll done.\033[0m Set these as **GitHub repo Variables** (Settings → Secrets and variables → Actions → Variables tab):

  AZURE_CLIENT_ID        $APP_ID
  AZURE_TENANT_ID        $TENANT_ID
  AZURE_SUBSCRIPTION_ID  $SUBSCRIPTION_ID
  TS_ENDPOINT            https://eus.codesigning.azure.net/
  TS_ACCOUNT_NAME        $SIGNING_ACCOUNT
  TS_CERT_PROFILE        $CERT_PROFILE

No secrets needed — the App Registration has zero client secrets; auth is
federated via OIDC.

Next:
  1. Paste those six values into GitHub repo Variables:
       Settings → Secrets and variables → Actions → Variables tab.
  2. Create an Environment called 'release':
       Settings → Environments → New environment → 'release'.
     (The Windows signing job is gated on this environment.)
  3. Run the 'Verify OIDC' workflow:
       Actions → Verify OIDC → Run workflow.
  4. Tag a release:
       git tag v1.0.0 && git push --tags
     The release workflow signs the Windows .exe automatically.
EOF
