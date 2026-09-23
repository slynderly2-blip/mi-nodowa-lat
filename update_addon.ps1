# Script para actualizar addon en servidor Minecraft via SFTP
# Requiere: Renci.SshNet.dll (descargado automáticamente vía NuGet)

$ErrorActionPreference = "Stop"

# Config
$SFTP_HOST = "carina.mcserverhost.com"
$SFTP_PORT = 2022
$SFTP_USER = "Abram Huaygua.48518e6a"
$SFTP_PASS = "ortizuwu20"
$LOCAL_ADDON = "nodowa_economy_addon_fixed.mcpack"
$REMOTE_PATH = "/development_behavior_packs/nodowa_economy_connector_bp"

Write-Host "🔧 Actualizando addon en servidor Minecraft..." -ForegroundColor Cyan

# 1. Descargar SSH.NET si no existe
$sshNetDll = ".\Renci.SshNet.dll"
if (!(Test-Path $sshNetDll)) {
    Write-Host "`n📦 Descargando SSH.NET..." -ForegroundColor Yellow
    $nugetUrl = "https://www.nuget.org/api/v2/package/SSH.NET/2020.0.2"
    $zipPath = ".\sshnet.zip"
    Invoke-WebRequest -Uri $nugetUrl -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath ".\sshnet_temp" -Force
    Copy-Item ".\sshnet_temp\lib\netstandard2.0\Renci.SshNet.dll" $sshNetDll
    Remove-Item $zipPath, ".\sshnet_temp" -Recurse -Force
    Write-Host "✓ SSH.NET descargado" -ForegroundColor Green
}

# 2. Cargar SSH.NET
Add-Type -Path $sshNetDll

# 3. Extraer addon
Write-Host "`n📂 Extrayendo addon..." -ForegroundColor Yellow
$extractPath = ".\addon_temp"
if (Test-Path $extractPath) {
    Remove-Item $extractPath -Recurse -Force
}
Expand-Archive -Path $LOCAL_ADDON -DestinationPath $extractPath
Write-Host "✓ Extraído a $extractPath" -ForegroundColor Green

# 4. Conectar SFTP
Write-Host "`n🌐 Conectando a $SFTP_HOST..." -ForegroundColor Yellow
$authMethod = New-Object Renci.SshNet.PasswordAuthenticationMethod($SFTP_USER, $SFTP_PASS)
$connectionInfo = New-Object Renci.SshNet.ConnectionInfo($SFTP_HOST, $SFTP_PORT, $SFTP_USER, $authMethod)
$sftp = New-Object Renci.SshNet.SftpClient($connectionInfo)
$sftp.Connect()
Write-Host "✓ Conectado" -ForegroundColor Green

try {
    # 5. Limpiar carpeta remota
    Write-Host "`n🗑️ Limpiando carpeta remota..." -ForegroundColor Yellow
    try {
        $files = $sftp.ListDirectory($REMOTE_PATH)
        $deleted = 0
        foreach ($file in $files) {
            if ($file.Name -ne "." -and $file.Name -ne "..") {
                try {
                    $sftp.DeleteFile("$REMOTE_PATH/$($file.Name)")
                    $deleted++
                } catch {
                    # Puede ser directorio
                }
            }
        }
        Write-Host "✓ $deleted archivos eliminados" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Error limpiando: $_" -ForegroundColor Yellow
    }
    
    # 6. Subir archivos nuevos
    Write-Host "`n📤 Subiendo archivos nuevos..." -ForegroundColor Yellow
    $uploaded = 0
    Get-ChildItem -Path $extractPath -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Substring($extractPath.Length + 1).Replace("\", "/")
        $remotePath = "$REMOTE_PATH/$relativePath"
        
        Write-Host "  → $relativePath" -ForegroundColor Gray
        
        # Crear directorio si no existe
        $remoteDir = Split-Path $remotePath -Parent
        try {
            $sftp.GetAttributes($remoteDir) | Out-Null
        } catch {
            try {
                $sftp.CreateDirectory($remoteDir)
            } catch {}
        }
        
        # Subir archivo
        $fileStream = [System.IO.File]::OpenRead($_.FullName)
        $sftp.UploadFile($fileStream, $remotePath, $true)
        $fileStream.Close()
        $uploaded++
    }
    
    Write-Host "`n✅ $uploaded archivos subidos exitosamente" -ForegroundColor Green
    
} finally {
    $sftp.Disconnect()
    $sftp.Dispose()
}

# 7. Limpiar
Remove-Item $extractPath -Recurse -Force

Write-Host "`n🎉 Addon actualizado correctamente!" -ForegroundColor Cyan
Write-Host "   Reinicia el servidor Minecraft con: stop" -ForegroundColor Yellow
