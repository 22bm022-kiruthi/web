# 🚀 QUICK START - How to Run Your App

## ⚡ Fastest Way (Recommended)

### Step 1: Start Backend (Pick ONE method)

**Method A: With Auto-Restart (Best)**
```
Double-click: BACKEND_PERSISTENT.bat
```
✅ Keeps backend running forever  
✅ Auto-restarts if it crashes  
✅ Never worry about backend stopping

**Method B: Simple Start**
```
Double-click: START_BACKEND_AUTO.bat
```

### Step 2: Start Frontend
```
Double-click: START_ALL_SERVICES.bat
```
or manually:
```bash
npm run dev
```

### Step 3: Open Browser
```
http://localhost:5173
```

---

## 🔴 If You See Connection Errors

### Error: `ECONNREFUSED 127.0.0.1:5003`

**This means backend is not running!**

**Quick Fix:**
```
Double-click: BACKEND_PERSISTENT.bat
```

Then refresh your browser.

---

## 💡 Pro Tips

1. **Use BACKEND_PERSISTENT.bat** - it's bulletproof
2. **Keep terminal windows open** - closing them stops services
3. **Watch for red banner** - tells you if backend is down
4. **Backend must run before frontend** - start it first

---

## ✅ You're Ready!

- ✓ Backend: Running on port 5003
- ✓ Frontend: http://localhost:5173
- ✓ Health Check: http://localhost:5003/api/health
- ✓ Auto-restart: Enabled

**Enjoy!** 🎉
