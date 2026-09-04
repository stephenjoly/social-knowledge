#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DEPLOY_TARGET:?Set DEPLOY_TARGET (for example deploy@example-host)}"
: "${DEPLOY_COMPOSE_DIR:?Set DEPLOY_COMPOSE_DIR}"
: "${DEPLOY_CONTAINER:?Set DEPLOY_CONTAINER}"
: "${DEPLOY_BASE_URL:?Set DEPLOY_BASE_URL}"
target="$DEPLOY_TARGET"
build_dir="${DEPLOY_BUILD_DIR:-/tmp/social-knowledge-build}"
compose_dir="$DEPLOY_COMPOSE_DIR"
container="$DEPLOY_CONTAINER"
base_url="${DEPLOY_BASE_URL%/}"
smoke_username=""
agent_key_id=""
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="/data/backups/social-knowledge-pre-deploy-$backup_stamp.sqlite3"

cleanup() {
  status=$?
  if [[ -n "$smoke_username" ]]; then
    ssh "$target" "sudo docker exec '$container' node dist/smoke-user.js delete '$smoke_username'" >/dev/null 2>&1 || true
  fi
  if [[ -n "$agent_key_id" ]]; then
    ssh "$target" "sudo docker exec '$container' node dist/smoke-user.js delete-key demo '$agent_key_id'" >/dev/null 2>&1 || true
  fi
  if [[ $status -ne 0 ]]; then
    echo "Deployment acceptance failed. Roll back with: sudo docker tag social-knowledge:rollback-last social-knowledge:local && cd $compose_dir && sudo docker compose up -d --force-recreate social-knowledge" >&2
  fi
  exit "$status"
}
trap cleanup EXIT

cd "$project_dir"
npm run typecheck
npm test
npm run build

rsync -az --delete --exclude node_modules --exclude dist --exclude dist-ui --exclude .git --exclude .env ./ "$target:$build_dir/"
ssh "$target" "sudo docker exec '$container' mkdir -p /data/backups && sudo docker exec '$container' node --input-type=module -e \"import Database from 'better-sqlite3'; const db=new Database('/data/social-knowledge.sqlite3'); await db.backup('$backup_path'); db.close()\" && sudo docker tag social-knowledge:local social-knowledge:rollback-last && cd '$build_dir' && sudo docker build -t social-knowledge:local . && cd '$compose_dir' && sudo docker compose up -d --force-recreate social-knowledge"

for attempt in {1..30}; do
  if curl -fsS "$base_url/health" >/dev/null; then
    SMOKE_BASE_URL="$base_url" npm run smoke:live
    smoke_username="deploy-smoke-$(openssl rand -hex 8)"
    smoke_password="$(openssl rand -base64 32)"
    ssh "$target" "sudo docker exec -e SMOKE_USER_PASSWORD='$smoke_password' '$container' node dist/smoke-user.js create '$smoke_username'"
    E2E_BASE_URL="$base_url" E2E_USERNAME="$smoke_username" E2E_PASSWORD="$smoke_password" npx playwright test --retries=1
    E2E_BASE_URL="$base_url" E2E_USERNAME="$smoke_username" E2E_PASSWORD="$smoke_password" node scripts/smoke-oauth.mjs
    agent_pair="$(ssh "$target" "sudo docker exec '$container' node dist/smoke-user.js create-key demo 'Deployment Agent API'")"
    IFS=$'\t' read -r agent_key_id agent_token <<< "$agent_pair"
    SMOKE_BASE_URL="$base_url" AGENT_API_TOKEN="$agent_token" node scripts/smoke-agent-api.mjs
    E2E_BASE_URL="$base_url" AGENT_API_TOKEN="$agent_token" node scripts/smoke-mcp.mjs
    exit 0
  fi
  sleep 2
done

echo "Deployment did not become healthy within 60 seconds" >&2
exit 1
