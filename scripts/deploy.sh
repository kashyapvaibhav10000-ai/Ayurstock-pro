#!/bin/bash

REPO_DIR="/root/Ayurstock-pro"
BRANCH="main"

echo "Deploying AyurStock Pro at $(date)..."

cd $REPO_DIR || exit

# Always pull latest code
git fetch origin $BRANCH
git reset --hard origin/$BRANCH

echo "Installing dependencies..."
npm install

echo "Generating Prisma client..."
npx prisma generate

echo "Applying schema changes to database..."
npx prisma db push --accept-data-loss=false

echo "Building..."
npm run build

echo "Restarting service..."
systemctl restart ayurstock

echo "Deploy complete at $(date)!"
