# 🎯 DURATION SELECTION - COMPLETE!

## ✅ **What's Been Updated**

### Backend Functions:
- ✅ **generate-video**: Duration validation, credit cost calculation (5s=1 credit, 10s=2 credits)
- ✅ **video-generation-webhook**: Credit refund logic based on duration

### Frontend:
- ✅ **Duration Selection UI**: Toggle between 5s (1 credit) and 10s (2 credits)
- ✅ **Dynamic Button Text**: Shows selected duration and credit cost
- ✅ **Credit Validation**: Button disabled if insufficient credits
- ✅ **Polling Logic**: Uses correct duration from selection

## 🚀 **Deploy Updated Functions**

### 1. Deploy generate-video
**URL:** https://supabase.com/dashboard/project/fsrabyevssdxaglriclw/functions/generate-video

**Steps:**
1. Click "Deploy a new version"
2. Copy from: `/Users/mohammedtahir/Dev/web-dev/nextjs/vloggo/supabase/functions/generate-video/index.ts`
3. Deploy

### 2. Deploy video-generation-webhook
**URL:** https://supabase.com/dashboard/project/fsrabyevssdxaglriclw/functions/video-generation-webhook

**Steps:**
1. Click "Deploy a new version"
2. Copy from: `/Users/mohammedtahir/Dev/web-dev/nextjs/vloggo/supabase/functions/video-generation-webhook/index.ts`
3. **⚠️ UNCHECK "Enforce JWT verification"**
4. Deploy

## ✨ **New Features**

### Duration Selection:
- 🎬 **5 seconds** - 1 credit
- 🎬 **10 seconds** - 2 credits

### Smart Credit Management:
- ✅ Validates sufficient credits before generation
- ✅ Deducts correct amount based on duration
- ✅ Refunds correct amount on failure
- ✅ Dynamic button text shows cost

### User Experience:
- 🎯 Clear duration selection buttons
- 💰 Credit cost displayed upfront
- 🔒 Button disabled if insufficient credits
- 📱 Responsive design

## 🧪 **Test After Deployment**

1. **Select 5 seconds** → Should show "1 credit"
2. **Select 10 seconds** → Should show "2 credits"
3. **Generate video** → Should deduct correct credits
4. **Check Replicate** → Should show correct duration in wan-2.5-i2v
5. **Video result** → Should match selected duration

**Ready to test!** 🎉
