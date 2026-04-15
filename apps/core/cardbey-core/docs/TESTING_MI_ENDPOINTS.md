# Testing MI Endpoints - Quick Guide

## Issue: Access Denied

The `/api/signage/playlist/:playlistId` endpoint requires `tenantId` and `storeId` query parameters that match the playlist's tenant/store.

## Solution 1: Add Query Parameters

```powershell
$headers = @{ Authorization = "Bearer dev-admin-token" }

# Get playlist with tenant/store params
$playlist = Invoke-RestMethod `
  -Uri "http://192.168.1.12:3001/api/signage/playlist/cmitl4z06002qjvloyj09vq15?tenantId=YOUR_TENANT&storeId=YOUR_STORE" `
  -Headers $headers

# Check MI data
$playlist.playlist.items | Select-Object id, @{n="hasMI";e={!!($_.miEntity) -or !!($_.asset.miEntity)}}
```

## Solution 2: Find Playlists for Your Tenant/Store

```powershell
$headers = @{ Authorization = "Bearer dev-admin-token" }

# List playlists (will use tenant/store from auth context or query params)
$playlists = Invoke-RestMethod `
  -Uri "http://192.168.1.12:3001/api/signage-playlists?tenantId=YOUR_TENANT&storeId=YOUR_STORE" `
  -Headers $headers

# Pick a playlist ID from the list
$playlistId = $playlists.items[0].id

# Get full playlist details
$playlist = Invoke-RestMethod `
  -Uri "http://192.168.1.12:3001/api/signage/playlist/$playlistId?tenantId=YOUR_TENANT&storeId=YOUR_STORE" `
  -Headers $headers
```

## Solution 3: Use Database Script

Run the helper script to find playlist tenant/store:

```bash
cd apps/core/cardbey-core
tsx scripts/checkPlaylistTenant.js cmitl4z06002qjvloyj09vq15
```

Or list all playlists:

```bash
tsx scripts/checkPlaylistTenant.js
```

## Solution 4: Use Environment Variables

Set in your `.env` file:
```
DEV_TENANT_ID=your-tenant-id
DEV_STORE_ID=your-store-id
```

Then the endpoint will use these as defaults in dev mode.

## Checking MI Data

Once you have the playlist:

```powershell
# Check if items have MI
$playlist.playlist.items | ForEach-Object {
    [PSCustomObject]@{
        ItemId = $_.id
        HasItemMI = !!$_.miEntity
        HasAssetMI = !!$_.asset.miEntity
        MIEntityId = $_.miEntity.id ?? $_.asset.miEntity.id ?? "null"
    }
}

# Or check a specific item
$item = $playlist.playlist.items[0]
Write-Host "Item MI:" $item.miEntity
Write-Host "Asset MI:" $item.asset.miEntity
```

## Running Backfill

Before testing, make sure to run the backfill:

```bash
cd apps/core/cardbey-core
npm run backfill:mi-signage
```

This will create MIEntity records for existing assets and playlist items.
