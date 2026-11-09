#!/usr/bin/env bash
set -euo pipefail
cd "/home/vaibhav/Documents/Ayur-stock pro"

git diff --quiet && git diff --cached --quiet || { echo "uncommitted changes"; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "not on main"; exit 1; }
git push origin main

npm run build

ssh ayur 'cd ~/ayurstock \
  && DB=$(grep ^DATABASE_URL= .env | cut -d= -f2- | tr -d "\"") \
  && pg_dump "$DB" > ~/backup_$(date +%F_%H%M).sql \
  && OLD=$(git rev-parse HEAD) \
  && git pull origin main \
  && (git diff --quiet $OLD HEAD -- package-lock.json || npm install) \
  && npx prisma generate \
  && npx prisma migrate deploy'

rsync -az --delete --exclude cache .next/ ayur:ayurstock/.next-new/

ssh -t ayur 'cd ~/ayurstock \
  && sudo systemctl stop ayurstock.service \
  && rm -rf .next-old && mv .next .next-old && mv .next-new .next \
  && sudo systemctl start ayurstock.service \
  && sleep 5 && curl -sI http://127.0.0.1:3000/login | head -1'
