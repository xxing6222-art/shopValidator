#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
cd "$script_dir"

eval "$(pyenv init - zsh)"
pyenv shell Agent

for source_file in app.js ranking.js decision-engine.js fact-store.js interview-policy.js storevalidator-worker.mjs; do
  node --check "$source_file"
done

node test_fact_store.js
node test_decision_engine.js
node test_interview_policy.js
node test_site_report.mjs
node test_share_routes.mjs
node test_shape_contract.mjs
node test_demo_turn_cap.mjs
python build_site.py

run_wrangler() {
  local log_path=${WRANGLER_LOG_PATH:-/tmp/wrangler-storevalidator.log}
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

run_wrangler deploy --dry-run --config wrangler.storevalidator.toml
run_wrangler deploy --config wrangler.storevalidator.toml
