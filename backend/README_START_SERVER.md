# 🚀 HOW TO START THE BACKEND SERVER

## ⚠️ IMPORTANT: The backend server MUST be running for the app to work!

---

## 🔴 Error You're Seeing:
```
[vite] http proxy error: /api/supabase/fetch
Error: connect ECONNREFUSED 127.0.0.1:5003
```

**This means: Backend server is NOT running!**

---

## ✅ SOLUTION: Start the Backend Server

### **Method 1: Double-Click the Batch File (EASIEST)**

1. Navigate to: `backend/` folder
2. **Double-click: `START_SERVER.bat`**
3. A CMD window will open showing:
   ```
   Starting Backend Server
   Server will run on: http://127.0.0.1:5003
   ```
4. **KEEP THIS WINDOW OPEN!**
5. Go back to your browser and refresh (F5)

---

### **Method 2: PowerShell with Auto-Restart**

1. Navigate to: `backend/` folder
2. **Right-click: `START_SERVER.ps1`** → **Run with PowerShell**
3. A PowerShell window will open with auto-restart capability
4. **KEEP THIS WINDOW OPEN!**
5. Go back to your browser and refresh (F5)

---

### **Method 3: Manual Terminal Command**

Open PowerShell in the project root and run:

```powershell
cd backend
$env:PORT=5003; node server.js
```

**KEEP THE TERMINAL OPEN!** (Don't close it or press Ctrl+C)

---

## 🔍 How to Check if Server is Running

### Option A: Open this URL in browser
```
http://127.0.0.1:5003/api/health
```

Should show: `{"status":"ok"}`

### Option B: PowerShell Command
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:5003/api/health"
```

Should output: `status: ok`

### Option C: Check Port 5001
```powershell
netstat -ano | findstr :5003
```

Should show TCP listener (not just UDP)

---

## 🛠️ Troubleshooting

### Problem: Port 5003 is already in use

**Symptoms:**
- Server says "Address already in use"
- Port conflict error

**Solution:**
```powershell
# Find process using port 5003
netstat -ano | findstr :5003

# Kill the conflicting process (replace PID with actual number)
taskkill /PID <PID_NUMBER> /F

# Or use this automated script:
$processId = (Get-NetUDPEndpoint -LocalPort 5003 -ErrorAction SilentlyContinue).OwningProcess
if ($processId) { Stop-Process -Id $processId -Force }

# Then start the server again
cd backend
$env:PORT=5003; node server.js
```

---

### Problem: Server starts then immediately exits

**Possible Causes:**
1. Syntax error in JavaScript files
2. Missing dependencies
3. Port conflict

**Solution:**
```powershell
# Check for syntax errors
cd backend
node -c server.js
node -c routes/baseline.js
node -c routes/noise.js
node -c routes/supabase.js

# Install missing dependencies
npm install

# Start with verbose logging
$env:DEBUG="*"; $env:PORT=5003
node server.js
```

---

### Problem: Frontend still shows ECONNREFUSED

**Checklist:**
- [ ] Backend server window is open and running
- [ ] No error messages in backend window
- [ ] Health check URL works: http://127.0.0.1:5003/api/health
- [ ] Browser has been refreshed (F5)
- [ ] Vite dev server is running (http://localhost:5173)

**If all above are true and still failing:**
```powershell
# Restart both servers
# 1. Stop backend (Ctrl+C in backend window)
# 2. Stop frontend (Ctrl+C in vite window)
# 3. Start backend first: cd backend && node server.js
# 4. Start frontend: npm run dev
```

---

## 📋 Development Workflow

### Every Time You Work on the Project:

1. **Open TWO terminal windows:**

   **Terminal 1 (Backend):**
   ```powershell
   cd backend
   $env:PORT=5003; node server.js
   ```
   ✅ Keep this running

   **Terminal 2 (Frontend):**
   ```powershell
   npm run dev
   ```
   ✅ Keep this running

2. **Check both are running:**
   - Backend: http://127.0.0.1:5001/api/health → `{"status":"ok"}`
   - Frontend: http://localhost:5173 → Your app UI

3. **When you're done:**
   - Press `Ctrl+C` in both terminals to stop

---

## 🎯 Quick Reference

| Service | Port | URL | Status Check |
|---------|------|-----|--------------|
| Backend API | 5003 | http://127.0.0.1:5003 | /api/health |
| Frontend (Vite) | 5173 | http://localhost:5173 | Open in browser |
| Supabase | N/A | https://zatafiglyptbujqzsohc.supabase.co | External |

---

## 🆘 Still Having Issues?

1. **Check Windows Firewall** - Allow Node.js through firewall
2. **Check Antivirus** - May be blocking port 5001
3. **Try Different Port** - Edit `backend/server.js`:
   ```javascript
   const PORT = process.env.PORT || 5004; // Change to 5004
   ```
4. **Check Node.js Version** - Requires Node.js v14 or higher:
   ```powershell
   node --version
   ```

---

## ✨ Summary

**REMEMBER:** 
- ✅ Backend server MUST be running (keep window open)
- ✅ Frontend dev server MUST be running (npm run dev)
- ✅ Both need to run simultaneously
- ❌ Closing backend window = ECONNREFUSED error

**The error you saw will NEVER happen again if you:**
1. Start backend server BEFORE using the app
2. Keep the backend server window OPEN
3. Check http://127.0.0.1:5003/api/health before using app

---

**Need help? Check the backend terminal window for error messages!**
