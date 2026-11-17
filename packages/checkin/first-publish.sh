#!/usr/bin/env bash
# One time, after `npm login`: publish spooky-checkin, then let the GitHub job publish every
# later version with no saved token. Run from anywhere.
set -euo pipefail
cd "$(dirname "$0")"
npm whoami >/dev/null || { echo "Sign in first: npm login"; exit 1; }
npm publish --access public
npm trust github spooky-checkin --file publish-checkin.yml --repo banana-intelligence-dot-ai/spookyparticles --allow-publish -y
echo "Published. Later versions: bump the version, merge, then run: gh workflow run publish-checkin.yml -R banana-intelligence-dot-ai/spookyparticles"
