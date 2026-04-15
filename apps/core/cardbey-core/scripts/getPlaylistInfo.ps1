# PowerShell script to get playlist tenant/store info
# Usage: .\getPlaylistInfo.ps1 <playlistId>

param(
    [Parameter(Mandatory=$true)]
    [string]$PlaylistId
)

$headers = @{ Authorization = "Bearer dev-admin-token" }

# Try to get playlist info (might fail if access denied, but we can check error)
try {
    $playlist = Invoke-RestMethod -Uri "http://192.168.1.12:3001/api/signage/playlist/$PlaylistId" -Headers $headers -ErrorAction Stop
    Write-Host "Playlist found:" -ForegroundColor Green
    $playlist.playlist | Format-List id, name, tenantId, storeId
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($errorResponse) {
        Write-Host "Error: $($errorResponse.message)" -ForegroundColor Red
        Write-Host "`nTo find the correct tenant/store, you can:" -ForegroundColor Yellow
        Write-Host "1. List all playlists: GET /api/signage-playlists?tenantId=XXX&storeId=YYY" -ForegroundColor Cyan
        Write-Host "2. Or check the database directly" -ForegroundColor Cyan
    } else {
        Write-Host "Error: $_" -ForegroundColor Red
    }
}
