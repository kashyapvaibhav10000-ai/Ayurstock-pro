# Serverless Configuration Guide

This guide explains how to properly configure AyurStock Pro for serverless deployment (Vercel) with optimal performance and reliability.

## Database Connection Pooling (PostgreSQL)

### Why Connection Pooling?
- Each Vercel function cold start creates a new database connection
- Without pooling, you'll hit PostgreSQL connection limits
- Connection pool reuses TCP connections efficiently

### Option 1: Vercel Postgres (Recommended)
If using Vercel Postgres (built-in connection pooling):

```bash
# Your DATABASE_URL already has pooling enabled
# No additional configuration needed!
```

### Option 2: External PostgreSQL with PgBouncer

If using self-hosted or AWS RDS PostgreSQL:

1. **Set up PgBouncer** as a connection pool middleware:
   ```bash
   # Install pgbouncer on a separate server
   apt-get install pgbouncer
   
   # Configure /etc/pgbouncer/pgbouncer.ini
   [databases]
   mydb = host=your-postgres-host port=5432 dbname=mydb
   
   [pgbouncer]
   pool_mode = transaction  # Transaction pooling (best for serverless)
   max_client_conn = 1000
   default_pool_size = 10
   ```

2. **Update DATABASE_URL**:
   ```
   postgresql://user:password@pgbouncer-host:6432/mydb
   ```

3. **Prisma Configuration**:
   - Already configured in `lib/db.ts` with error handling
   - Connection timeouts: Automatic disconnect after 300 seconds

### Option 3: AWS RDS Proxy (For AWS deployments)

```bash
# RDS Proxy acts as connection pool
# Update DATABASE_URL to RDS Proxy endpoint
# Enable IAM authentication if needed
```

## Environment Variables for Vercel

Add these to your Vercel project settings:

```env
# Database (see options above)
DATABASE_URL="postgresql://user:password@host:5432/db"

# Authentication
NEXTAUTH_SECRET="[generate: openssl rand -base64 32]"

# AI Vision API
OPENROUTER_API_KEY="your_openrouter_key"

# Optional: Debugging
DEBUG=false
```

## PDF Processing Optimizations

Already configured in `lib/aiParser.ts`:

| Setting | Value | Purpose |
|---------|-------|---------|
| MAX_PDF_PAGES | 100 | Limit pages to prevent timeout |
| MAX_PDF_TEXT_LENGTH | 500KB | Stop processing after 500KB text |
| REQUEST_TIMEOUT_MS | 45s | Abort requests after 45s |
| MAX_CONCURRENT_REQUESTS | 2 | Rate limit API calls |
| REQUEST_INTERVAL_MS | 500ms | Delay between API calls |

## API Rate Limiting

OpenRouter API limits:
- Free tier: ~100 requests/day
- Paid: Usually 1000+ requests/day

Configured with **2 concurrent requests** to stay within limits.

## Monitoring & Debugging

### Enable detailed logging:

In `lib/aiParser.ts`:
- Logs PDF extraction progress
- Logs API timeouts and errors
- Logs deduplication stats

### Check Vercel logs:
```bash
vercel logs --follow
```

### Test PDF import locally:
```bash
# Upload a small test PDF (< 50 pages)
# Check console output for timing
```

## Performance Checklist

✅ **Before deployment, verify:**

- [ ] DATABASE_URL is set in Vercel environment
- [ ] OPENROUTER_API_KEY is configured
- [ ] NEXTAUTH_SECRET is unique and strong
- [ ] Connection pool is working (check RDS/PgBouncer status)
- [ ] Test medicine import with sample PDF
- [ ] Check Vercel logs for any connection errors

## Troubleshooting

### "Too many connections" error
→ Your PostgreSQL connection limit reached
→ Solution: Enable connection pooling (see above)

### "Request timeout" during PDF import
→ PDF is too large (>100 pages)
→ Solution: Increase MAX_PDF_PAGES in lib/aiParser.ts (with caution)

### API rate limit errors (429)
→ OpenRouter rate limit hit
→ Solution: Reduce MAX_CONCURRENT_REQUESTS or upgrade OpenRouter plan

### Cold starts over 60 seconds
→ Possible causes:
  - Database connection slow
  - Large PDF being processed
  - API rate limiting delay
→ Solution: Monitor Vercel logs, optimize as needed

## Production Recommendations

1. **Use Vercel Postgres** for simplicity (built-in pooling)
2. **Set up PgBouncer** if using external PostgreSQL
3. **Monitor response times** in Vercel analytics
4. **Set up alerts** for failed imports
5. **Use incremental exports** for large medicine imports
