#!/bin/bash
# TURN (coturn) للمكالمات WebRTC على نفس VPS
set -euo pipefail

HOST_IP="${CONTABO_HOST:-109.199.111.29}"
TURN_USER="${TURN_USERNAME:-reyweet}"
TURN_PASS="${TURN_CREDENTIAL:-}"

if [[ -z "$TURN_PASS" ]]; then
  TURN_PASS="$(openssl rand -hex 16)"
  echo "[coturn] generated TURN_CREDENTIAL (save in .env)"
fi

export DEBIAN_FRONTEND=noninteractive
apt-get install -y coturn >/dev/null 2>&1 || apt-get install -y coturn

mkdir -p /etc/turnserver
cat >/etc/turnserver.conf <<EOF
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=${HOST_IP}
external-ip=${HOST_IP}
realm=reyweet
server-name=reyweet-turn
fingerprint
lt-cred-mech
user=${TURN_USER}:${TURN_PASS}
no-multicast-peers
no-cli
min-port=49152
max-port=65535
log-file=/var/log/turnserver.log
EOF

sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true
grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn 2>/dev/null || echo 'TURNSERVER_ENABLED=1' >>/etc/default/coturn

systemctl enable coturn
systemctl restart coturn

ufw allow 3478/tcp 2>/dev/null || true
ufw allow 3478/udp 2>/dev/null || true
ufw allow 49152:65535/udp 2>/dev/null || true

echo "[coturn] running on ${HOST_IP}:3478 user=${TURN_USER}"
echo "TURN_USERNAME=${TURN_USER}"
echo "TURN_CREDENTIAL=${TURN_PASS}"
