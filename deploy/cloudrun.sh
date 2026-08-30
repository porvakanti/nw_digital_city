#!/usr/bin/env bash
#
# Build the container and put it on Cloud Run. One service: it serves the page
# and answers the questions, so there is one thing to deploy and one URL.
#
#   PROJECT=my-project ./deploy/cloudrun.sh
#
# Everything else has a sensible default and can be overridden the same way.

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-nw-digital-city}"
PROVIDER="${PROVIDER:-vertex}"
MODEL="${MODEL:-gemini-2.0-flash}"
FRAME_ANCESTORS="${FRAME_ANCESTORS:-}"

if [ -z "$PROJECT" ]; then
  echo "Set PROJECT, or run: gcloud config set project <id>" >&2
  exit 2
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/apps/${SERVICE}"
SA="${SERVICE}@${PROJECT}.iam.gserviceaccount.com"

echo "· project ${PROJECT}, region ${REGION}, provider ${PROVIDER}"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com aiplatform.googleapis.com --project "$PROJECT"

gcloud artifacts repositories describe apps --location "$REGION" --project "$PROJECT" \
  >/dev/null 2>&1 || gcloud artifacts repositories create apps \
  --repository-format=docker --location "$REGION" --project "$PROJECT"

# Its own service account, holding exactly one role: call Vertex AI. The
# service never needs to read anything else in the project.
gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SERVICE" --project "$PROJECT" \
    --display-name "NW Digital City"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${SA}" --role roles/aiplatform.user --condition=None >/dev/null

gcloud builds submit --tag "$IMAGE" --project "$PROJECT" .

ENV="NW_PROVIDER=${PROVIDER},NW_MODEL=${MODEL},NW_PROJECT=${PROJECT},NW_REGION=${REGION}"
[ -n "$FRAME_ANCESTORS" ] && ENV="${ENV},NW_FRAME_ANCESTORS=${FRAME_ANCESTORS}"

gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --service-account "$SA" \
  --set-env-vars "$ENV" \
  --cpu 1 --memory 512Mi --min-instances 0 --max-instances 4 \
  --allow-unauthenticated

echo
echo "· live at: $(gcloud run services describe "$SERVICE" --region "$REGION" \
  --project "$PROJECT" --format 'value(status.url)')"
