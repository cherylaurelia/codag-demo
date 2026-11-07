#!/bin/zsh
# Recorded run: raw docker capture -> codag-log-mcp (fails) -> converter -> codag-log-mcp (loads) -> claude -p.
# Needs: codag-log-mcp on PATH (codag.ai/install.sh), claude CLI. Run from the web/ directory.
set -u
RUN=${0:A:h:h}/data/run; RAW=$RUN/postgres-docker.log; CSV=$RUN/postgres-docker.codag.csv
WORK=/tmp/codag-bench-run; mkdir -p $WORK
{ echo '$ codag-log-mcp setup --log-file postgres-docker.log --client claude'; codag-log-mcp setup --log-file $RAW --client claude --output-dir $WORK/raw --force 2>&1 | sed "s#$RUN/##g; s#/private##g"; } > $RUN/before.txt
[[ ${SKIP_AGENTS:-0} = 1 ]] && SKIP=1 || SKIP=0
{ echo '$ node cli/codag-convert.ts postgres-docker.log postgres-docker.codag.csv postgres'; node cli/codag-convert.ts $RAW $CSV postgres 2>&1 | sed "s#$RUN/##g";
  echo '$ codag-log-mcp setup --log-file postgres-docker.codag.csv --client claude'; codag-log-mcp setup --log-file $CSV --client claude --output-dir $WORK/csv --force 2>&1 | sed "s#$RUN/##g; s#/private##g; s#$WORK/csv#./.codag#g; s#$(command -v codag-log-mcp)#codag-log-mcp#g; s#$HOME#~#g"; } > $RUN/after.txt
node bench/truth.ts $RAW > $RUN/truth.json
printf '{"mcpServers":{"codag-logs":{"command":"%s","args":["%s","service-logs"]}}}' "$(command -v codag-log-mcp)" "$CSV" > $WORK/mcp.json
Q='Checkout started failing a few minutes into this capture. Using the codag-logs tools, find which database user is failing to authenticate, the UTC time (HH:MM:SS) of its first and last failed attempt, and how many failed attempts it made. End with exactly one line: ANSWER: <user> <first HH:MM:SS> <last HH:MM:SS> <count>'
[[ $SKIP = 1 ]] && exit 0
cd $WORK
for i in 1 2 3 4; do
  claude -p "$Q" --mcp-config $WORK/mcp.json --strict-mcp-config --setting-sources project \
    --allowedTools "mcp__codag-logs__*" --model sonnet --output-format stream-json --verbose > $WORK/run-$i.jsonl 2>/dev/null &
done
wait
