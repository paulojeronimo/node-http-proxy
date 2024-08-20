#!/usr/bin/env bash
set -eou pipefail
cd "$(dirname "$0")"

[ -d node_modules ] || npm i

node index.js
