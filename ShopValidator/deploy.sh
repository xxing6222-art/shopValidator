#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
cd "$script_dir"

eval "$(pyenv init - zsh)"
pyenv shell Agent

for source_file in \
  app.js \
  ranking.js \
  decision-engine.js \
  fact-store.js \
  interview-policy.js \
  server-decision-adapter.mjs \
  worker.mjs \
  dashscope-asr-client.js \
  dashscope-tts-client.js \
  test_dashscope_tts_live.mjs \
  test_production_asr.mjs \
  test_production_tts.mjs \
  stepfun-client.js \
  agent-orchestrator.js \
  storevalidator-worker.mjs
do
  node --check "$source_file"
done

node test_fact_store.js
node test_decision_engine.js
node test_interview_policy.js
node test_server_decision_adapter.mjs
node test_dashscope_asr_client.mjs
node test_dashscope_tts_client.mjs
node test_stepfun_client.mjs
node test_agent_orchestrator.js
node test_worker.mjs
node test_share_routes.mjs
node test_site_report.mjs

# The live ASR check uses the real paid/network API and is therefore opt-in.
# Run with RUN_DASHSCOPE_LIVE_ASR=1 when validating credentials or the model.
if [[ "${RUN_DASHSCOPE_LIVE_ASR:-0}" == "1" ]]; then
  python test_dashscope_asr_live.py
fi
if [[ "${RUN_DASHSCOPE_LIVE_TTS:-0}" == "1" ]]; then
  node test_dashscope_tts_live.mjs
fi

python build_site.py

# Cloudflare is occasionally unreachable directly from this workspace. Prefer
# the existing local proxy and retry directly if the proxy is unavailable.
run_wrangler() {
  local log_path=${WRANGLER_LOG_PATH:-/tmp/wrangler-yongge.log}
  if WRANGLER_LOG_PATH="$log_path" \
    HTTPS_PROXY=${HTTPS_PROXY:-http://127.0.0.1:7897} \
    HTTP_PROXY=${HTTP_PROXY:-http://127.0.0.1:7897} \
    ALL_PROXY=${ALL_PROXY:-socks5://127.0.0.1:7897} \
    wrangler "$@"
  then
    return 0
  fi
  WRANGLER_LOG_PATH="$log_path" \
  env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
    wrangler "$@"
}

# `wrangler.toml` publishes the static artifact through a Worker and creates the
# custom-domain DNS record/certificate at Cloudflare's edge.
run_wrangler deploy --dry-run --config wrangler.toml
run_wrangler deploy --config wrangler.toml
