[CmdletBinding()]
param(
  [string]$Server = "124.221.179.150",
  [string]$KeyPath = "C:\Users\pc\.ssh\qcflow_deploy_key",
  [string]$EnvFile = "deploy\staging\.env.staging",
  [string]$RemoteDir = "/root/qcflow-staging",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$bundleDir = Join-Path $projectRoot "deploy-bundle"
$bundleName = "qcflow-staging-{0}.tgz" -f (Get-Date -Format "yyyyMMdd_HHmmss")
$bundlePath = Join-Path $bundleDir $bundleName

Push-Location $projectRoot
try {
  $dirty = git status --porcelain
  if ($dirty) { throw "工作区不干净，拒绝打包。请先提交或清理变更。" }
  if (-not (Test-Path -LiteralPath $KeyPath)) { throw "找不到 SSH 私钥：$KeyPath" }
  if ($Apply -and -not (Test-Path -LiteralPath $EnvFile)) { throw "找不到 staging 环境文件：$EnvFile" }

  New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
  git archive --format=tar.gz --output=$bundlePath HEAD
  if (-not (Test-Path -LiteralPath $bundlePath)) { throw "源码包生成失败" }

  if (-not $Apply) {
    Write-Output "STAGING DRY RUN"
    Write-Output "源码包：$bundlePath"
    if (-not (Test-Path -LiteralPath $EnvFile)) { Write-Output "环境文件：尚未创建（部署前需要）" }
    Write-Output "未连接服务器，未部署。确认后加 -Apply。"
    return
  }

  ssh -i $KeyPath -o BatchMode=yes -o ConnectTimeout=10 "root@$Server" "mkdir -p '$RemoteDir'"
  scp -i $KeyPath $bundlePath "root@${Server}:$RemoteDir/$bundleName"
  scp -i $KeyPath $EnvFile "root@${Server}:$RemoteDir/.env.staging"
  ssh -i $KeyPath -o BatchMode=yes -o ConnectTimeout=10 "root@$Server" "cd '$RemoteDir' && tar xzf '$bundleName' && docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build"
  Write-Output "Staging 已部署到 127.0.0.1:9443；请通过 SSH 隧道访问。"
}
finally {
  Pop-Location
}
