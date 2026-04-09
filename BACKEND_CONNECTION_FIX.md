# Backend Connection Error Fix

## Problem
Getting error: `Error: connect ECONNREFUSED 127.0.0.1:5003`

This means the **backend server on port 5003 is not running**.

---

## ✅ QUICK FIX (Run These Scripts)

### Option 1: Persistent Backend (Best - Auto-Restarts)
Double-click this file:
```
BACKEND_PERSISTENT.bat
```
**Recommended!** Keeps backend running and auto-restarts if it crashes.

### Option 2: Auto-Start Backend (Quick Check)
Double-click this file:
```
START_BACKEND_AUTO.bat
```

### Option 3: Check & Start Backend (PowerShell)
Right-click and run as administrator:
```
CHECK_AND_START_BACKEND.ps1
```

### Option 4: Start All Services
Double-click this file:
```
START_ALL_SERVICES.bat
```

---

## 🔍 What Was Fixed

### 1. **Persistent Backend Server**
- Created `BACKEND_PERSISTENT.bat` - keeps backend running, auto-restarts if crashes
- Created `BACKEND_PERSISTENT.ps1` - PowerShell version with better monitoring
- Backend will now automatically restart if it stops unexpectedly

### 2. **Backend Server Auto-Checks**
- Created `START_BACKEND_AUTO.bat` - automatically checks if backend is running
- Created `CHECK_AND_START_BACKEND.ps1` - PowerShell health checker
- Updated `START_ALL_SERVICES.bat` - now verifies backend started successfully

### 3. **Visual Health Indicator**
- Added `BackendHealthIndicator.tsx` component
- Shows red alert banner when backend is down
- Auto-checks every 30 seconds
- Appears in top-right corner of your app

### 4. **Improved Startup Scripts**
- All startup scripts now verify services actually started
- Added 5-second wait time for backend to fully start
- Added success/failure messages

---

## 📋 How to Prevent This Error

### Always Start Backend Before Using App

**Method 1: Use START_ALL_SERVICES.bat (Easiest)**
```
Double-click: START_ALL_SERVICES.bat
```
This starts:
- Backend Server (Port 5003) ✓
- PCA Service (Port 6005) ✓
- Frontend (Port 5173) ✓

**Method 2: Manual Backend Start**
```bash
cd backend
set PORT=5003
node server.js
```

**Method 3: PowerShell**
```powershell
cd backend
$env:PORT=5003
node server.js
```

---

## 🔧 Troubleshooting

### Check if Backend is Running
```powershell
netstat -ano | findstr "5003" | findstr "LISTENING"
```

If you see output, backend is running ✓  
If no output, backend is NOT running ✗

### Test Backend Health
Open in browser:
```
http://127.0.0.1:5003/api/health
```

Should return: `{"status":"ok"}`

### Kill Stuck Backend Process
If backend won't start due to "port in use":
```powershell
# Find process on port 5003
netstat -ano | findstr "5003"

# Kill the process (replace PID with actual number)
taskkill /F /PID <PID>
```

---

## 🚨 Error Detection

The app now automatically detects when backend is down:

1. **Red banner appears** in top-right corner
2. Shows error message: "Backend Server Not Connected"
3. Tells you to run `START_BACKEND_AUTO.bat`
4. Updates every 30 seconds
5. Can be dismissed by clicking ×

---

## 📝 What Each Script Does

### START_BACKEND_AUTO.bat
- Checks if backend is already running
- If not, starts it automatically
- Verifies it started successfully
- Shows helpful messages

### CHECK_AND_START_BACKEND.ps1
- More advanced PowerShell version
- Tests health endpoint
- Better error reporting
- Can run as administrator

### START_ALL_SERVICES.bat (Updated)
- Now checks each service before starting
- Verifies services actually started
- Shows ✓ or ✗ for each service
- Waits longer for services to initialize

---

## 🎯 Best Practices

1. **Always use START_ALL_SERVICES.bat** to start everything
2. **Keep terminal windows open** - closing them stops services
3. **Check for red banner** - if you see it, backend is down
4. **Use health check scripts** before troubleshooting
5. **Don't close backend window** while using the app

---

## 📞 Quick Commands Reference

| Task | Command |
|------|---------|
| Start all services | `START_ALL_SERVICES.bat` |
| Start backend only | `START_BACKEND_AUTO.bat` |
| Check backend status | `CHECK_AND_START_BACKEND.ps1` |
| Test health | Open `http://127.0.0.1:5003/api/health` |
| Check port 5003 | `netstat -ano \| findstr "5003"` |
| Kill process on 5003 | `taskkill /F /PID <PID>` |

---

## ✅ You're All Set!

The backend is now running, and you have tools to:
- ✓ Auto-start backend when it's down
- ✓ Visual alerts when backend disconnects
- ✓ Health check scripts
- ✓ Better error messages

**This error should not happen again** if you:
1. Use the startup scripts
2. Keep terminal windows open
3. Watch for the red health indicator

---

## 🔗 Related Files

- `src/components/BackendHealthIndicator.tsx` - Health indicator component
- `START_BACKEND_AUTO.bat` - Auto-start script
- `CHECK_AND_START_BACKEND.ps1` - PowerShell health checker
- `START_ALL_SERVICES.bat` - Start all services (updated)
- `backend/server.js` - Backend server code
- `vite.config.ts` - Proxy configuration (port 5003)
