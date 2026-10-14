#!/usr/bin/env bash
# Usage: source dev-session.sh
export API=http://localhost:8001
export TOKEN=$(curl -s -X POST $API/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@suhara.local","password":"admin12345"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
export RID=$(curl -s "$API/api/v1/returns?limit=1" -H "Authorization: Bearer $TOKEN" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).items[0]._id)}catch{console.log('')}})")
echo "API=$API"
echo "TOKEN=${TOKEN:0:20}..."
echo "RID=$RID"