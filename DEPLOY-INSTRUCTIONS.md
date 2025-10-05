# 🚀 Deploy Updated Webhook - CRITICAL

## The Problem
The webhook at Supabase has **TWO issues**:
1. ❌ **verify_jwt: true** - Blocks Replicate webhooks (they don't send JWT)
2. ❌ **Old code** - Still uses hunyuanvideo-foley audio stitching

## The Fix (Updated Local Code)
✅ Fixed `supabase.raw()` errors
✅ No audio stitching - uses wan-2.5-i2v native audio
✅ Stores video directly in Supabase storage
✅ Duration set to 10 seconds (not 5)

## Deploy Steps (Supabase Dashboard)

### 1. Go to Edge Functions
https://supabase.com/dashboard/project/fsrabyevssdxaglriclw/functions/video-generation-webhook

### 2. Deploy New Version
Click "Deploy a new version" or "Edit"

### 3. Copy Local Code
Copy ENTIRE contents from:
```
/Users/mohammedtahir/Dev/web-dev/nextjs/vloggo/supabase/functions/video-generation-webhook/index.ts
```

### 4. **CRITICAL: Disable JWT Verification**
⚠️ **MUST UNCHECK**: "Enforce JWT verification"
OR set: `verify_jwt: false`

This allows Replicate webhooks to work!

### 5. Deploy
Click "Deploy" button

## Verify It Works
After deployment, check:
- Status should be 200 (not 401 or 500)
- No "Missing authorization header" errors
- No "supabase.raw is not a function" errors

## Alternative: Manual SQL for Stats
If you want atomic updates without fetch-then-update, you can use Postgres functions, but the current solution works fine.

