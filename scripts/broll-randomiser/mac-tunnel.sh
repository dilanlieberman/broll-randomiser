#!/bin/bash
# Reverse SSH tunnel keeper for the B-Roll Randomiser delivery flow.
#
# Holds a reverse tunnel (VPS 127.0.0.1:2222 -> this Mac's sshd on :22) so the VPS
# Discord bot's FINAL step can rsync a finished ad straight to this Mac. On every
# (re)connect — i.e. on wake / network return — it first catch-up-pulls any ads
# that were filed on the VPS while this Mac was asleep/offline, then holds the
# tunnel until it drops. So delivery is event-driven (per Discord prompt) and the
# catch-up is reconnect-driven — never a polling timer.
#
# Launched + kept alive by ~/Library/LaunchAgents/com.pinnacle.broll-tunnel.plist.

set -u

SSH=/usr/bin/ssh
RSYNC=/usr/bin/rsync
CFG=/Users/dilanlieberman/.ssh/config
LOCAL_DIR=/Users/dilanlieberman/smma-agency/new-ad-iterations/
REMOTE_DIR=hostinger-vps:/root/smma-agency/new-ad-iterations/

mkdir -p "$LOCAL_DIR"

while true; do
  # Catch-up: pull anything filed while we were away (no-op when nothing is new).
  "$RSYNC" -az -e "$SSH -F $CFG" "$REMOTE_DIR" "$LOCAL_DIR" 2>/dev/null

  # Hold the reverse tunnel. Blocks until the connection drops (sleep / wifi change
  # / VPS reboot); ServerAlive* detects a dead link, ExitOnForwardFailure bails if
  # :2222 is already taken so KeepAlive can retry cleanly.
  "$SSH" -F "$CFG" -N \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes \
    -R 2222:localhost:22 hostinger-vps

  # Brief backoff before reconnecting (and re-running catch-up).
  sleep 5
done
