$ErrorActionPreference = "Stop"

Write-Host "Descargando SSH.NET..." -ForegroundColor Yellow

# Descargar y cargar SSH.NET
$dllPath = ".\Renci.SshNet.dll"
if (!(Test-Path $dllPath)) {
    Invoke-WebRequest -Uri "https://github.com/sshnet/SSH.NET/releases/download/2020.0.2/SshNet.Security.Cryptography.2020.0.2.nupkg" -OutFile "sshnet.zip"
    Expand-Archive "sshnet.zip" "sshnet_temp" -Force
    Copy-Item "sshnet_temp\lib\netstandard2.0\Renci.SshNet.dll" $dllPath
    Remove-Item "sshnet.zip", "sshnet_temp" -Recurse -Force
}

Add-Type -Path $dllPath

Write-Host "Extrayendo addon..." -ForegroundColor Yellow

# Extraer
if (Test-Path "addon_temp") { Remove-Item "addon_temp" -Recurse -Force }
Expand-Archive "nodowa_economy_addon_fixed.mcpack" "addon_temp"

Write-Host "Conectando SFTP..." -ForegroundColor Yellow

# Conectar
$auth = New-Object Renci.SshNet.PasswordAuthenticationMethod("Abram Huaygua.48518e6a", "ortizuwu20")
$conn = New-Object Renci.SshNet.ConnectionInfo("carina.mcserverhost.com", 2022, "Abram Huaygua.48518e6a", $auth)
$sftp = New-Object Renci.SshNet.SftpClient($conn)
$sftp.Connect()

Write-Host "Limpiando carpeta remota..." -ForegroundColor Yellow

# Limpiar
$remote = "/development_behavior_packs/nodowa_economy_connector_bp"
foreach ($f in $sftp.ListDirectory($remote)) {
    if ($f.Name -ne "." -and $f.Name -ne "..") {
        try { $sftp.DeleteFile("$remote/$($f.Name)") } catch {}
    }
}

Write-Host "Subiendo archivos..." -ForegroundColor Yellow

# Subir
$count = 0
Get-ChildItem "addon_temp" -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring((Resolve-Path "addon_temp").Path.Length + 1).Replace("\", "/")
    $dst = "$remote/$rel"
    Write-Host "  $rel"
    $fs = [System.IO.File]::OpenRead($_.FullName)
    $sftp.UploadFile($fs, $dst, $true)
    $fs.Close()
    $count++
}

$sftp.Disconnect()
Remove-Item "addon_temp" -Recurse -Force

Write-Host "`n✅ $count archivos subidos. Reinicia el servidor con: stop" -ForegroundColor Green
