#!/bin/bash
# KASUMI API Server — Start script
# Usage: ./start.sh [port]

PORT=${1:-3001}
cd "$(dirname "$0")"
PORT=$PORT npx ts-node src/index.ts
