[CmdletBinding()]
param(
  [string]$Server = "124.221.179.150",
  [string]$KeyPath = "C:\Users\pc\.ssh\qcflow_deploy_key",
  [string]$Container = "qcflow-pg",
  [string]$RemoteBackupDir = "/root/backups/postgres",
  [string]$LocalBackupDir = "",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $LocalBackupDir) {
  $LocalBackupDir = Join-Path (Split-Path -Parent (Split-Path -Parent $projectRoot)) "backup\postgres-runs"
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$fileName = "qcflow-$stamp.dump"
$remotePath = "$RemoteBackupDir/$fileName"
$localRunDir = Join-Path $LocalBackupDir $stamp
$localPath = Join-Path $localRunDir $fileName

if (-not $Apply) {
  Write-Output "POSTGRES BACKUP DRY RUN"
  Write-Output "容器：$Container"
  Write-Output "远端：$remotePath"
  Write-Output "本地：$localPath"
  Write-Output "未连接服务器，未执行备份。确认后加 -Apply。"
  return
}

if (-not (Test-Path -LiteralPath $KeyPath)) { throw "找不到 SSH 私钥：$KeyPath" }
New-Item -ItemType Directory -Force -Path $localRunDir | Out-Null

ssh -i $KeyPath -o BatchMode=yes -o ConnectTimeout=10 "root@$Server" "mkdir -p '$RemoteBackupDir'"
ssh -i $KeyPath -o BatchMode=yes -o ConnectTimeout=10 "root@$Server" "docker exec $Container sh -lc 'PGPASSWORD=`"`$POSTGRES_PASSWORD`" pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" -Fc' > '$remotePath'"

$remoteCheck = ssh -i $KeyPath -o BatchMode=yes -o ConnectTimeout=10 "root@$Server" "test -s '$remotePath' && head -c 5 '$remotePath' && printf '|' && sha256sum '$remotePath'"
if ($remoteCheck -notmatch "\|([0-9a-f]{64})") { throw "远端备份校验失败" }
$expectedHash = $Matches[1]

scp -i $KeyPath "root@${Server}:$remotePath" $localPath
if (-not (Test-Path -LiteralPath $localPath)) { throw "备份下载失败" }
$localHash = (Get-FileHash -LiteralPath $localPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($localHash -ne $expectedHash) { throw "备份 SHA256 与远端不一致" }

$manifest = [pscustomobject]@{
  createdAt = (Get-Date).ToString("o")
  server = $Server
  container = $Container
  file = $fileName
  bytes = (Get-Item -LiteralPath $localPath).Length
  sha256 = $localHash
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $localRunDir "metadata.json") -Encoding utf8
Write-Output "PostgreSQL 备份完成：$localPath"
