#!/usr/bin/env bash
set -euo pipefail

# Jerry GitHub Actions -> Google Cloud Workload Identity Federation
PROJECT_ID="jerry-ai-8061a"
REPOSITORY="edojaefe666-cell/Project-Jerry-v46-Release-Candidate3"
REPOSITORY_ID="1461307934"
POOL_ID="github"
PROVIDER_ID="jerry-github"
SERVICE_ACCOUNT_NAME="jerry-github-firebase"
SECRET_NAME="jerry-firebase-admin-key"

echo "Configuring project: $PROJECT_ID"
gcloud config set project "$PROJECT_ID"

echo "Enabling required APIs..."
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  secretmanager.googleapis.com \
  identitytoolkit.googleapis.com \
  --project="$PROJECT_ID"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SERVICE_ACCOUNT_EMAIL="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "Creating or checking workload identity pool..."
if ! gcloud iam workload-identity-pools describe "$POOL_ID" \
  --project="$PROJECT_ID" --location="global" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" --location="global" \
    --display-name="Jerry GitHub Actions"
fi

echo "Creating or updating the repository-restricted OIDC provider..."
if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location="global" \
  --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location="global" \
    --workload-identity-pool="$POOL_ID" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository_id == '$REPOSITORY_ID' && assertion.ref == 'refs/heads/main'"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location="global" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="Jerry GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository_id == '$REPOSITORY_ID' && assertion.ref == 'refs/heads/main'"
fi

echo "Creating or checking the dedicated service account..."
if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" \
  --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --project="$PROJECT_ID" \
    --display-name="Jerry GitHub Firebase Auth Test"
fi

POOL_RESOURCE="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID"
PRINCIPAL="principalSet://iam.googleapis.com/$POOL_RESOURCE/attribute.repository_id/$REPOSITORY_ID"

echo "Granting GitHub's repository identity permission to impersonate the service account..."
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$PRINCIPAL" >/dev/null

echo "Granting only Firebase Authentication administration permissions..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/firebaseauth.admin" >/dev/null

echo "Creating Secret Manager container if it does not exist..."
if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud secrets create "$SECRET_NAME" \
    --project="$PROJECT_ID" \
    --replication-policy="automatic"
fi

echo "Allowing the dedicated service account to read this one secret..."
gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

echo
echo "SETUP COMMANDS COMPLETED."
echo "Add these TWO GitHub repository secrets (values below are identifiers, not passwords):"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER=$POOL_RESOURCE/providers/$PROVIDER_ID"
echo "GCP_WORKLOAD_IDENTITY_SERVICE_ACCOUNT=$SERVICE_ACCOUNT_EMAIL"
echo
echo "Next: upload the ORIGINAL Firebase Admin service-account JSON as a new version"
echo "of Secret Manager secret '$SECRET_NAME'. Do not paste the JSON into chat."
echo "Wait 5 minutes for IAM changes to propagate before running the workflow."
