# Migration to Docker and Cloudflare Tunneling

This plan details the steps to migrate the Ayurstock-pro application from Vercel to a self-hosted Docker environment on Debian, using Cloudflare Tunnel for secure external access.

## Proposed Changes

### Configuration
#### [MODIFY] [next.config.js](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/next.config.js)
- Enable `output: 'standalone'` to optimize the build for Docker.

### Docker Environment
#### [NEW] [.dockerignore](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/.dockerignore)
- Exclude `node_modules`, `.next`, `.git`, and other unnecessary files from the Docker context.

#### [NEW] [Dockerfile](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/Dockerfile)
- Implement a multi-stage build (deps, builder, runner) using `node:20-alpine`.
- Copy Prisma schema and generated client.
- Include Tesseract OCR data files.

#### [NEW] [docker-compose.yml](file:///c:/Users/vaibh/Documents/Ayur-stock%20pro/docker-compose.yml)
- Define `app` service for the Next.js application.
- Define `db` service using `postgres:16-alpine`.
- Define `tunnel` service using `cloudflare/cloudflared` to expose the app.

## Verification Plan

### Automated Tests
- Run `docker-compose up --build` to verify that all services start correctly.
- Check container logs for any runtime errors (`docker-compose logs -f`).

### Manual Verification
1.  **Local Access**: Verify the app is accessible at `http://localhost:3000`.
2.  **Database Connection**: Ensure the app can connect to the PostgreSQL container and run migrations.
3.  **Tunnel Connection**: Verify the Cloudflare Tunnel status in the Cloudflare Dashboard and access the app via the configured public hostname.
