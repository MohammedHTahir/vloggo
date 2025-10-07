# 🚨 CRITICAL: OLD FUNCTIONS STILL DEPLOYED

## 🚨 **Root Cause Found**
There are **OLD FUNCTIONS** still deployed on Supabase that are calling the audio stitching:

- ❌ `add-audio` - Still deployed and being called
- ❌ `audio-generation-webhook` - Still deployed
- ❌ Old webhook logic - Still calling audio stitching

## 🧹 **IMMEDIATE CLEANUP REQUIRED**

### 1. Delete Old Functions (Supabase Dashboard)
Go to each function and **DELETE** them:

**Functions to DELETE:**
- `add-audio`
- `audio-generation-webhook` 
- `video-pipeline-webhook`
- `generate-video-with-audio`
- `process-video-pipeline`
- `trigger-audio-generation`
- `complete-generation`
- `manual-audio-trigger`
- `check-replicate-status`
- `test-generate-video`
- `migrate-video-to-storage`

### 2. Deploy Clean Functions
**ONLY deploy these functions:**

#### A. Deploy generate-video (CLEAN)
**URL:** https://supabase.com/dashboard/project/fsrabyevssdxaglriclw/functions/generate-video
- Copy from: `/Users/mohammedtahir/Dev/web-dev/nextjs/vloggo/supabase/functions/generate-video/index.ts`
- Deploy

#### B. Deploy video-generation-webhook (CLEAN)
**URL:** https://supabase.com/dashboard/project/fsrabyevssdxaglriclw/functions/video-generation-webhook
- Copy from: `/Users/mohammedtahir/Dev/web-dev/nextjs/vloggo/supabase/functions/video-generation-webhook/index.ts`
- **⚠️ UNCHECK "Enforce JWT verification"**
- Deploy

## ✅ **What This Fixes**
- ✅ NO more `tencent/hunyuanvideo-foley` calls
- ✅ NO more audio stitching
- ✅ Only wan-2.5-i2v (or wan-2.2-i2v-fast)
- ✅ Clean webhook processing
- ✅ Duration selection working

## 🎯 **Expected Result**
After cleanup:
- ✅ Only wan-2.5-i2v model called
- ✅ No audio stitching functions
- ✅ Clean webhook processing
- ✅ Duration selection (5s/10s) working

**DELETE THE OLD FUNCTIONS FIRST!** 🗑️
