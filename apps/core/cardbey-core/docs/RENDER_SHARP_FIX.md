# Fix for Sharp Native Binary Error on Render

## Problem
Sharp fails to load its native binaries on Render with Node 22, causing server crashes on startup.

## Solution Steps

### 1. Push Updated package.json

The `postinstall` script has been updated to properly rebuild sharp for Linux.

Run these commands in `cardbey-core`:

```powershell
git add package.json
git commit -m "Fix: Update postinstall script for sharp native binaries on Render"
git push origin main
```

### 2. Configure Render Settings

After pushing, configure Render:

#### A. Set Node Version to 20

1. Go to Render → `cardbey-core` service
2. Go to **Settings** → **Environment**
3. Add new environment variable:
   - **Key**: `NODE_VERSION`
   - **Value**: `20.10.0`
4. Click **Save Changes**

#### B. Update Build Command

1. Go to **Settings** → **Build & Deploy**
2. Update **Build Command** to:
   ```
   npm install --include=optional
   ```
3. Keep **Start Command** as:
   ```
   npm start
   ```
4. Click **Save Changes**

#### C. Trigger Manual Deploy

1. Go to **Manual Deploy** → **Deploy latest commit**
2. Wait for build to complete
3. Check **Runtime logs** to confirm server starts successfully

### 3. Verify Server is Running

After deploy, test:
- `https://cardbey-core.onrender.com/api/screens`
- Should return JSON (even errors are OK - means server is running)

## Why This Works

1. **Node 20**: Sharp has better compatibility with Node 20 than Node 22
2. **`--include=optional`**: Ensures sharp's native dependencies are installed
3. **Postinstall script**: Rebuilds sharp specifically for linux-x64 platform
4. **Lazy loading**: All sharp imports are already lazy-loaded, so server won't crash if sharp fails to load

## If Still Not Working

If you still see sharp errors after this:

1. Check Runtime logs for exact error message
2. Verify `NODE_VERSION=20.10.0` is set in Render
3. Verify Build Command includes `--include=optional`
4. Check that `postinstall` script ran successfully (look in Build logs)

