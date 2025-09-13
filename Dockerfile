# Stage 1: Build the app
FROM node:23.11-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

WORKDIR /app

COPY package*.json ./

RUN pnpm install

COPY . ./

# TODO: use it or remove
# RUN pnpm run build

EXPOSE 5173

CMD ["pnpm", "run", "dev", "--", "--host", "0.0.0.0"]

# TODO: use it or remove
# # Stage 2: Serve with nginx
# FROM nginx:stable-alpine
#
# COPY --from=builder /app/dist /usr/share/nginx/html
#
# # Copy custom nginx config (optional, for SPA routing)
# # Uncomment if you want history mode support for Vue Router
# # COPY nginx.conf /etc/nginx/conf.d/default.conf
#
# EXPOSE 80
#
# CMD ["nginx", "-g", "daemon off;"]
