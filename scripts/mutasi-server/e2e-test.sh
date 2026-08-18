#!/usr/bin/env bash
# End-to-end smoke test for the mutasi sync API through the public domain.
set -u
BASE="https://apitool.gwk.web.id/mutasi-api"
TOKEN="mutasi2026gwk"
H_AUTH="X-Mutasi-Token: ${TOKEN}"
H_JSON="Content-Type: application/json"

echo "== healthz =="
curl -s "${BASE}/healthz"; echo

echo "== create web-a =="
curl -s -X POST -H "${H_AUTH}" -H "${H_JSON}" \
  --data '{"id":"web-a","name":"WEB A"}' "${BASE}/webs"; echo

echo "== put state web-a =="
curl -s -X PUT -H "${H_AUTH}" -H "${H_JSON}" \
  --data '{"state":{"hello":"world"},"updatedBy":"e2e"}' \
  "${BASE}/state?web=web-a"; echo

echo "== get state web-a =="
curl -s -H "${H_AUTH}" "${BASE}/state?web=web-a"; echo

echo "== SSE stream (3s) =="
curl -s --max-time 3 -H "${H_AUTH}" "${BASE}/stream?web=web-a&token=${TOKEN}" | head -c 400; echo

echo "== unauthorized probe (expect 401) =="
curl -s -o /dev/null -w "%{http_code}\n" "${BASE}/webs"

echo "== cleanup: delete web-a =="
curl -s -X DELETE -H "${H_AUTH}" "${BASE}/webs/web-a"; echo

echo "DONE"
