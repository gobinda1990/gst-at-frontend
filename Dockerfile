# ---------- Stage 1: Build React/Vite app ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# Swapped npm ci for npm install
RUN npm install
COPY . .
RUN npm run build

# ---------- Stage 2: Serve with Nginx ----------
FROM nginx:1.27-alpine

# Copy built app
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose ports
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]