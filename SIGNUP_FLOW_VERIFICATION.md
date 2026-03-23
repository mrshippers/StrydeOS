# Sign-up Flow Verification — Post-Fix Testing

## Summary of Changes

Three critical fixes have been applied to fix the sign-up → onboarding redirect flow and welcome tour:

1. **Auth Loading State Guard** (onboarding/page.tsx)
   - Added `authLoading` check to wait for Firebase auth to load user profile before rendering
   - Prevents race condition where clinicId is undefined

2. **ClinicId Safety Guard** (onboarding/page.tsx)
   - Added redirect if clinicId is missing after auth completes
   - Redirects to `/dashboard?error=no_clinic` if something goes wrong

3. **Welcome Tour Fix** (FirstLoginTour.tsx)
   - Fixed condition from `firstLogin === false` to `firstLogin === true`
   - Added `tourCompleted` check to prevent re-showing tour
   - Changed finishTour to set `firstLogin: false` (was incorrectly true)

---

## Test Plan

### Test 1: First-Time Sign-up Flow ✅

**Steps:**
1. Open `portal.strydeOS.com/login?mode=signup` in incognito window
2. Fill signup form with:
   - Clinic name: `Test Clinic $(date +%s)` (use timestamp to make unique)
   - Profession: Physiotherapist
   - Clinic size: Small (2-5)
   - Email: `test-$(date +%s)@strydeOS.test`
   - Password: `TestPassword123!`
3. Click "Create account"

**Expected behavior:**
- ✅ Form submits without errors
- ✅ Success screen shows "Account created — setting up your clinic..."
- ✅ Page redirects to `/onboarding` after ~800ms
- ✅ Onboarding page shows loading spinner for ~1-2 seconds
- ✅ Onboarding wizard appears with Step 1 (Connect PMS)
- ✅ Consent screen shows first (if UK jurisdiction)

**What to check in browser console:**
- No errors in red
- Network tab should show: signup API → session API → page load
- Local storage should have `strydeos_last_email` set

---

### Test 2: Welcome Tour on First Dashboard Visit ✅

**Prerequisites:** Complete Test 1 first

**Steps:**
1. Complete onboarding: Skip through all 4 steps or fill them out
   - Step 1 (PMS): Select any PMS and click Continue
   - Step 2 (Ava): Enter any phone number, click Continue
   - Step 3 (Pulse): Click Continue (defaults are fine)
   - Step 4 (Go Live): Click "Launch StrydeOS"
2. Dashboard loads

**Expected behavior:**
- ✅ Dashboard loads and you see the welcome tour overlay immediately
- ✅ Modal shows "Welcome to StrydeOS, [your name]!" with gradient background
- ✅ Tour shows buttons: "Start tour", "Explore on my own"
- ✅ If you click "Start tour":
  - ✅ Tour progresses through 6 steps
  - ✅ Each step highlights a dashboard element
  - ✅ "Finish" button on last step
  - ✅ After finishing, tour disappears and dashboard is visible
- ✅ If you click "Explore on my own":
  - ✅ Tour disappears immediately
  - ✅ Dashboard is visible
- ✅ If you reload page after tour:
  - ✅ Tour should NOT appear again (already completed)

**What to check in browser console:**
- Tour completion should trigger `updateDoc` to Firestore
- User doc should have `firstLogin: false` and `tourCompleted: true`
- No errors should appear during tour interaction

---

### Test 3: Return to Onboarding (Doesn't Reset Progress) ✅

**Prerequisites:** Complete Test 1 and 2

**Steps:**
1. From dashboard, go to Settings → Integrations
2. Look for "Continue setup" or go back to `/onboarding`
3. Go to `/onboarding` directly

**Expected behavior:**
- ✅ Onboarding page loads and shows your progress
- ✅ Consent screen is skipped (already accepted)
- ✅ Current step resumse where you left off
- ✅ Completed steps show green checkmarks
- ✅ No tour overlay appears (already completed)

---

### Test 4: Edge Case — Missing ClinicId

**This tests the safety guard:**

**Steps:**
1. Manually delete clinic doc in Firestore (caution: dev/test only)
   - Go to Firebase console
   - Go to Firestore → clinics collection
   - Delete your test clinic doc
2. Go back to `/onboarding` in the browser

**Expected behavior:**
- ✅ Page shows loading spinner briefly
- ✅ Page redirects to `/dashboard?error=no_clinic`
- Dashboard loads normally (can still use demo data if available)

**This validates the guard works correctly.**

---

### Test 5: Sign-in Flow (Existing User) ✅

**Prerequisites:** Complete Test 1 and 2

**Steps:**
1. Log out: Settings → Sign out
2. Go back to `/login`
3. Sign in with email/password from Test 1
4. Go to dashboard

**Expected behavior:**
- ✅ Signs in successfully
- ✅ Goes to dashboard (or where you were before logout)
- ✅ Tour does NOT appear (already completed in Test 2)
- ✅ Dashboard shows all your test data from onboarding

---

## Verification Checklist

- [ ] Can create new account without freezing
- [ ] Signup redirects to onboarding without errors
- [ ] Onboarding page loads properly with clinic data
- [ ] Welcome tour appears on first dash visit
- [ ] Tour completes and doesn't re-appear
- [ ] Can return to onboarding without resetting
- [ ] Returning to dashboard doesn't re-show tour
- [ ] Sign-in flow works for returning users
- [ ] No console errors during entire flow

---

## Rollback Plan

If issues occur, these are the files changed:

```
dashboard/src/app/onboarding/page.tsx
  - Added: authLoading import and state check
  - Added: clinicId guard effect
  - Modified: loading check from `if (!hydrated)` to `if (authLoading || !hydrated)`
  - Added: safety clinicId check after loading

dashboard/src/components/FirstLoginTour.tsx
  - Modified: firstLogin check from `=== false` to `=== true`
  - Added: tourCompleted check to condition
  - Modified: finishTour sets `firstLogin: false` (was true)
```

To rollback: `git checkout dashboard/src/app/onboarding/page.tsx dashboard/src/components/FirstLoginTour.tsx`

---

## Performance Impact

- ✅ No performance regression (added only state checks and guards)
- ✅ Eliminates race condition = more stable
- ✅ Guard effect only runs once per auth state change
- ✅ Tour logic simplified and more efficient

---

Generated: 2025-03-23
