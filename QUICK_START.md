# 🚀 StrydeOS Quick Start

**You're ready to go! Your clinic is live.**

---

## Step 1: Log In

Go to **https://www.strydeos.com/login** and sign in with your owner or admin account (credentials from your secure store or password manager).

---

## Step 2: What You'll See

✅ **Dashboard** — Spires Physiotherapy London with 9 weeks of real metrics  
✅ **No Demo Banner** — All data is real (seeded from production)  
✅ **4 Clinicians** — Jamal, Andrew, Max, Joe with performance data  
✅ **12 Patients** — Real patient list with sessions, insurance flags  
✅ **Pulse Board** — Patient continuity tracking  

---

## Step 3: Explore

- **Dashboard** — View clinic KPIs and trends
- **Clinicians** — Compare performance across team
- **Patients** — Browse patient list and details
- **Pulse** — See patient board and comms log
- **Intelligence** — Analytics (currently demo charts, wire next)
- **Ava** — Voice AI receptionist (demo mode, ElevenLabs integration next)
- **Settings** — Configure PMS, targets, team

---

## Step 4: Optional — Connect Your PMS

Supported PMS: WriteUpp, Cliniko, Halaxy, Zanda (Power Diary)

1. Go to **Settings** → PMS Integration
2. Select your PMS provider and enter API key
3. Test connection and save
4. Trigger sync: `POST https://www.strydeos.com/api/pipeline/run`
   - Header: `Authorization: Bearer <CRON_SECRET>`
5. Data will sync daily at midnight automatically

---

## Need Help?

- **Full Details:** See `DEPLOYMENT_COMPLETE.md`
- **Implementation Summary:** See `IMPLEMENTATION_SUMMARY.md`

---

**Ready to go! 🎉**
