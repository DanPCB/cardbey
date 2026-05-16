# ⚡ Cardbey Core - Quick Setup with SQLite

**Database:** SQLite (file-based, no installation needed!)  
**Time:** 2 minutes

---

## 🚀 Setup Steps

```bash
# 1. Navigate to cardbey-core
cd cardbey-core

# 2. Install dependencies
npm install

# 3. .env file is already created with:
# DATABASE_URL="file:./dev.db"
# JWT_SECRET="change-me-in-production-use-long-random-string"

# 4. Generate Prisma client
npx prisma generate

# 5. Create database and run migrations
npx prisma migrate dev --name init

# 6. Start server
npm run dev
```

**Expected Output:**
```
✅ Server is running on http://localhost:3001
✅ Health check: http://localhost:3001/health
```

---

## 🧪 Test It Works

### Test 1: Health Check
```bash
curl http://localhost:3001/health
```

**Expected:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-31T...",
  "service": "cardbey-core",
  "version": "1.0.0"
}
```

---

### Test 2: Register User
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@cardbey.com",
    "password": "demo123",
    "displayName": "Demo User"
  }'
```

**Expected:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "demo@cardbey.com",
    "displayName": "Demo User",
    "hasBusiness": false,
    "roles": {"roles": ["viewer"]},
    "createdAt": "..."
  }
}
```

---

### Test 3: Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@cardbey.com",
    "password": "demo123"
  }'
```

---

### Test 4: Get User Info
```bash
# Use the token from register/login response
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 📊 Database Location

**SQLite file:** `cardbey-core/prisma/dev.db`

**View database:**
```bash
# Open Prisma Studio (visual database browser)
npx prisma studio
```

Opens at: http://localhost:5555

---

## 🔧 Troubleshooting

### "Prisma Client not generated"
```bash
npx prisma generate
```

### "Migration failed"
```bash
# Reset and try again
rm -f prisma/dev.db
npx prisma migrate dev --name init
```

### "Port 3001 already in use"
```bash
# Change PORT in .env
PORT=3002

# Or kill existing process
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

---

## ✅ Success Checklist

- [ ] Server starts on :3001
- [ ] Health check returns 200
- [ ] Can register new user
- [ ] Receives JWT token
- [ ] Can login with credentials
- [ ] /me endpoint returns user info
- [ ] dev.db file created in prisma/

---

## 📁 Files

```
cardbey-core/
├── prisma/
│   ├── schema.prisma          ✅ Updated (SQLite)
│   ├── dev.db                 ← Created by migration
│   └── migrations/
│       └── ..._init/          ← Created by migrate dev
│
├── .env                       ✅ Created
├── package.json
└── src/
    └── ... (server files)
```

---

## 🎯 What Changed from PostgreSQL

| Aspect | PostgreSQL | SQLite |
|--------|------------|--------|
| **Setup** | Install Postgres | ✅ No installation needed |
| **Database** | Server process | ✅ Single file (dev.db) |
| **Connection** | Host/port/credentials | ✅ Just file path |
| **Speed** | Fast | ✅ Faster (for development) |
| **ID Type** | uuid() | ✅ cuid() |
| **Arrays** | String[] | ✅ Json |

---

## 🚀 Next Steps

1. ✅ **Backend running** (you're done!)
2. **Start frontend:**
```bash
cd ../cardbey-web-latest
npm start
```

3. **Test complete flow:**
   - Register user
   - Login
   - Check post-login redirect
   - Track demands

---

**Status:** ✅ **SQLite backend ready in 2 minutes!**

Much faster than PostgreSQL setup, perfect for development!

