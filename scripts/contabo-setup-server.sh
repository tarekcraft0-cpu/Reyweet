#!/bin/bash
# تشغيل مرة واحدة على VPS Contabo (Ubuntu/Debian) كـ root
set -euo pipefail

if [[ -f /opt/retweet/.setup-done ]] && command -v node >/dev/null 2>&1 && command -v pm2 >/dev/null 2>&1; then
  echo "[contabo-setup] already configured — skip"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git nginx ffmpeg ufw ca-certificates gnupg rsync

# Node.js 22 LTS
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

npm install -g pm2 tsx 2>/dev/null || true
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 tsx
fi

mkdir -p /opt/retweet/app /var/lib/retweet
chown -R root:root /opt/retweet /var/lib/retweet

# جدار ناري أساسي
ufw --force reset || true
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw --force enable

cat >/etc/nginx/sites-available/retweet <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name _;
    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/retweet /etc/nginx/sites-enabled/retweet
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "[contabo-setup] Node $(node -v) — nginx — ffmpeg — pm2 جاهز"
touch /opt/retweet/.setup-done
