#!/bin/bash

# Configuration
REPO_DIR="/root/Ayurstock-pro"
BRANCH="main"

echo "Checking for AyurStock updates at $(date)..."

# Navigate to the application directory
cd $REPO_DIR || exit

# Fetch the latest metadata from GitHub
git fetch origin $BRANCH

# Compare the local Git commit hash with the remote GitHub commit hash
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "New code detected! Updating from $LOCAL to $REMOTE..."
    
    # Fast-forward to the exact GitHub state
    git reset --hard origin/$BRANCH
    
    # Destructively purge Next.js build cache to prevent UI freezing
    rm -rf .next
    
    echo "Installing new dependencies..."
    npm install
    
    echo "Compiling the production build..."
    npm run build
    
    echo "Restarting the PM2/SystemD service..."
    systemctl restart ayurstock
    
    echo "Awesome! The system was successfully updated at $(date)!"
else
    echo "Server is already running the latest code. No rebuild required."
fi
