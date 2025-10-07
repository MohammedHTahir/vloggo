# 🔧 MODEL NAME FIX - DEPLOY NOW

## 🚨 **Issue Found & Fixed**
The model name was incorrect! Changed from:
- ❌ `"wan-video/wan-2.5-i2v"` 
- ✅ `"wan-2.5-i2v"`

## 🚀 **Deploy Updated Function**

### 1. Deploy generate-video (FIXED MODEL NAME)
**URL:** https://supabase.com/dashboard/project/fsrabyevssdxaglriclw/functions/generate-video

**Steps:**
1. Click "Deploy a new version"
2. Copy from: `/Users/mohammedtahir/Dev/web-dev/nextjs/vloggo/supabase/functions/generate-video/index.ts`
3. Deploy

### 2. Deploy video-generation-webhook (if not done yet)
**URL:** https://supabase.com/dashboard/project/fsrabyevssdxaglriclw/functions/video-generation-webhook

**Steps:**
1. Click "Deploy a new version"
2. Copy from: `/Users/mohammedtahir/Dev/web-dev/nextjs/vloggo/supabase/functions/video-generation-webhook/index.ts`
3. **⚠️ UNCHECK "Enforce JWT verification"**
4. Deploy

## ✅ **What's Fixed**
- ✅ Correct model name: `"wan-2.5-i2v"`
- ✅ Duration selection: 5s (1 credit) or 10s (2 credits)
- ✅ Credit cost validation
- ✅ Smart refund logic
- ✅ Native audio (no foley stitching)

## 🧪 **Test After Deploy**
1. Select duration (5s or 10s)
2. Generate video
3. Should work without "model not available" error
4. Check Replicate - should show wan-2.5-i2v
5. Video should have native audio

**The model name fix should resolve the error!** 🎯
