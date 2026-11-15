# Oracle Cloud Free Tier Deployment for Stock Suggester

## 1. Choose the right Oracle free instance
- Use the always-free VM: `VM.Standard.E2.1.Micro` or `ARM.A1.Flex`.
- Ubuntu 22.04 or 24.04 is recommended.

## 2. Create the instance
1. Login to Oracle Cloud.
2. Go to `Compute -> Instances -> Create Instance`.
3. Choose an always-free shape.
4. Add your SSH public key.
5. Configure a public subnet and default VCN.
6. Add ingress rules for:
   - TCP 22 (SSH)
   - TCP 80 (HTTP)
   - TCP 8001 (optional, backend API access)

## 3. SSH into the instance
```bash
ssh -i ~/.ssh/id_rsa opc@<public-ip>
```

## 4. Install Docker and Git
```bash
sudo apt update
sudo apt install -y docker.io git
sudo usermod -aG docker $USER
newgrp docker
```

## 5. Clone your repo
```bash
git clone <your-repo-url> stock-suggester
cd stock-suggester/backend
```

## 6. Build the backend image
```bash
docker build -t stock-suggester-backend .
```

## 7. Run the backend container
Create a `.env` file on the instance with your keys, then:
```bash
docker run -d --restart unless-stopped \
  -p 8001:8001 \
  --name stock-suggester-backend \
  --env-file .env \
  stock-suggester-backend
```

## 8. Serve the frontend
Option A: use OCI static site or S3-like bucket for frontend.
Option B: install Node and build locally on the instance.

### Build frontend on instance
```bash
cd ~/stock-suggester
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install
npm run build
```

### Serve frontend with Nginx
```bash
sudo apt install -y nginx
sudo rm -f /etc/nginx/sites-enabled/default
sudo tee /etc/nginx/sites-available/stock-suggester <<'EOF'
server {
  listen 80;
  root /home/opc/stock-suggester/dist;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
  location / {
    try_files $uri $uri/ /index.html;
  }
  location /signals {
    proxy_pass http://127.0.0.1:8001;
  }
  location /research {
    proxy_pass http://127.0.0.1:8001;
  }
  location /performance {
    proxy_pass http://127.0.0.1:8001;
  }
  location /positions {
    proxy_pass http://127.0.0.1:8001;
  }
  location /research_status {
    proxy_pass http://127.0.0.1:8001;
  }
  location /trade_history {
    proxy_pass http://127.0.0.1:8001;
  }
  location /trigger_research {
    proxy_pass http://127.0.0.1:8001;
  }
}
EOF
sudo ln -s /etc/nginx/sites-available/stock-suggester /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## 9. Keep it running reliably
- Docker `--restart unless-stopped` keeps the backend up.
- For nginx, systemd already manages it.

## 10. Verify
- Visit `http://<public-ip>/` for frontend.
- Visit `http://<public-ip>:8001/performance` for backend API.

## 11. Optional: use `docker compose`
If you want a more reliable multi-service deployment, create a `docker-compose.yml` file and use `docker compose up -d`.

---

### Notes
- Keep secrets in `.env`, do not bake them into the Docker image.
- If you want 95% uptime, use `--restart unless-stopped` and verify periodic health checks.
