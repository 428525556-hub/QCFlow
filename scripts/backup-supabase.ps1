<#
.SYNOPSIS
  备份 QCFlow 的 Supabase 数据：全部业务表（JSON）+ Storage 对象 + 清单 + SHA256 校验值。

.DESCRIPTION
  - 数据库：用 secret key 走 PostgREST 逐表分页导出（绕过 RLS，拿到完整数据）
  - 文件：用项目 .env.local 里的 anon key 递归列出 Storage 目录并按公开 URL 下载
  - 每次运行输出到 backup/runs/<时间戳>/，不覆盖历史备份
  - 全程不打印任何密钥值

.PARAMETER SecretKey
  数据库导出用的 secret key（sb_secret_...）。也可用环境变量 SUPABASE_SECRET_KEY。
.PARAMETER SecretFile
  存放 secret key 的本地文件（单行）。与 -SecretKey 二选一；用完请自行删除。
.PARAMETER StorageOnly
  只备份 Storage（不需要 secret key）。
.PARAMETER SkipStorage
  只备份数据库（需要 secret key）。
.PARAMETER Proxy
  访问 Supabase 的 HTTP 代理，例如 http://127.0.0.1:7897。留空时自动探测本机 7897。

.EXAMPLE
  pwsh -File scripts/backup-supabase.ps1 -SecretFile D:\temp\sb-secret.txt

.EXAMPLE
  pwsh -File scripts/backup-supabase.ps1 -StorageOnly
#>
[CmdletBinding()]
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$EnvFile = '',
  [string]$OutRoot = '',
  [string]$SecretKey = $env:SUPABASE_SECRET_KEY,
  [string]$SecretFile = '',
  [string]$Proxy = '',
  [switch]$StorageOnly,
  [switch]$SkipStorage,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (-not $EnvFile) { $EnvFile = Join-Path $ProjectRoot '.env.local' }
if (-not $OutRoot) {
  # 默认放在工作区级 backup\runs（与 2026-09-25 的手工备份同一位置，不进入 Git 仓库）
  $workspaceRoot = Split-Path -Parent (Split-Path -Parent $ProjectRoot)
  $OutRoot = Join-Path $workspaceRoot 'backup\runs'
}

function Read-EnvValue([string]$Path, [string]$Name) {
  $line = Select-String -LiteralPath $Path -Pattern "^$([regex]::Escape($Name))=(.+)$" |
    Select-Object -First 1
  if (-not $line) { throw "缺少环境变量 $Name（$Path）" }
  return $line.Matches[0].Groups[1].Value.Trim()
}

function Resolve-SecretKey {
  if ($SecretKey) { return $SecretKey.Trim() }
  if ($SecretFile) {
    if (-not (Test-Path -LiteralPath $SecretFile)) { throw "找不到密钥文件：$SecretFile" }
    $value = (Get-Content -LiteralPath $SecretFile -Raw).Trim()
    if (-not $value) { throw "密钥文件为空：$SecretFile" }
    return $value
  }
  return ''
}

function Resolve-Proxy {
  if ($Proxy) { return $Proxy }
  try {
    $listening = Get-NetTCPConnection -State Listen -LocalPort 7897 -ErrorAction Stop
    if ($listening) { return 'http://127.0.0.1:7897' }
  } catch {
    # 没有本地代理时直接连接
  }
  return ''
}

function Invoke-Curl {
  param(
    [Parameter(Mandatory)][string]$Url,
    [string[]]$Headers = @(),
    [string]$Method = 'GET',
    [string]$Body = '',
    [string]$OutFile = ''
  )

  $arguments = @('-s', '--max-time', '180')
  if ($script:ProxyUrl) { $arguments += @('--proxy', $script:ProxyUrl) }
  if ($Method -ne 'GET') { $arguments += @('-X', $Method) }
  if ($OutFile) { $arguments += @('-o', $OutFile) }
  $arguments += @('-w', '%{http_code}', $Url)
  foreach ($header in $Headers) { $arguments += @('-H', $header) }
  if ($Body) { $arguments += @('--data-raw', $Body) }

  $status = & curl.exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "curl 执行失败（exit=$LASTEXITCODE）：$Url" }
  return [int]$status
}

if (-not (Test-Path -LiteralPath $EnvFile)) { throw "找不到 .env.local：$EnvFile" }
$supabaseUrl = Read-EnvValue $EnvFile 'NEXT_PUBLIC_SUPABASE_URL'
$publicKey = Read-EnvValue $EnvFile 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
$script:ProxyUrl = Resolve-Proxy
$secret = Resolve-SecretKey

if (-not $StorageOnly -and -not $secret) {
  throw "数据库导出需要 secret key：请用 -SecretFile / -SecretKey / SUPABASE_SECRET_KEY 提供；只备份文件请加 -StorageOnly"
}

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$runDir = Join-Path $OutRoot $stamp
if ((Test-Path -LiteralPath $runDir) -and -not $Force) { throw "本次备份目录已存在：$runDir（加 -Force 覆盖）" }
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$dbDir = Join-Path $runDir 'db'
$storageDir = Join-Path $runDir 'storage'
New-Item -ItemType Directory -Force -Path $storageDir | Out-Null
if (-not $StorageOnly) { New-Item -ItemType Directory -Force -Path $dbDir | Out-Null }

$tables = @(
  'orders', 'order_items', 'reservation_cartons', 'reservation_carton_items',
  'order_attachments', 'inspection_records', 'reinspection_records',
  'shipment_cartons', 'shipment_items', 'dispatch_records', 'unboxing_records',
  'registration_invites', 'user_profiles', 'inspection_teams', 'style_categories',
  'production_calendar', 'team_work_exceptions', 'inspection_schedule',
  'schedule_progress_records', 'schedule_change_logs', 'shipment_batches'
)

$tableSummary = @()
if (-not $StorageOnly) {
  $fetchFile = Join-Path ([IO.Path]::GetTempPath()) ("qcflow-backup-{0}.json" -f [guid]::NewGuid().ToString('N'))
  foreach ($table in $tables) {
    $rows = New-Object System.Collections.ArrayList
    $offset = 0
    $statusText = 'ok'

    while ($true) {
      $url = "$supabaseUrl/rest/v1/${table}?select=*&limit=1000&offset=$offset"
      $status = Invoke-Curl -Url $url -OutFile $fetchFile -Headers @("apikey: $secret", "Authorization: Bearer $secret")
      $body = if (Test-Path -LiteralPath $fetchFile) { (Get-Content -LiteralPath $fetchFile -Raw) } else { '' }
      $body = if ($body) { $body.Trim() } else { '' }

      if ($status -ne 200) {
        $statusText = if ($body -match 'PGRST205') { 'MISSING_TABLE' } else { "HTTP_$status" }
        break
      }
      if (-not $body -or $body -eq '[]') { break }

      try {
        $page = @($body | ConvertFrom-Json)
      } catch {
        $statusText = 'PARSE_ERROR'
        break
      }
      foreach ($row in $page) { [void]$rows.Add($row) }
      if ($page.Count -lt 1000) { break }
      $offset += $page.Count
    }

    $json = if ($rows.Count -eq 0) { '[]' } else { $rows | ConvertTo-Json -Depth 30 }
    Set-Content -LiteralPath (Join-Path $dbDir "$table.json") -Value $json -Encoding utf8
    $tableSummary += [pscustomobject]@{ table = $table; rows = $rows.Count; status = $statusText }
  }
  if (Test-Path -LiteralPath $fetchFile) { Remove-Item -LiteralPath $fetchFile -Force }
  $tableSummary | Export-Csv -Path (Join-Path $dbDir '_summary.csv') -NoTypeInformation -Encoding utf8
}

$storageRows = @()
$storageCount = 0
$storageBytes = [int64]0
if (-not $SkipStorage) {
  function Add-StoragePrefix {
    param([string]$Bucket, [string]$Prefix, [int]$Depth)
    if ($Depth -gt 8) { return }

    $payload = '{"prefix":"' + $Prefix + '","limit":1000,"offset":0}'
    $listFile = Join-Path ([IO.Path]::GetTempPath()) ("qcflow-list-{0}.json" -f [guid]::NewGuid().ToString('N'))
    $status = Invoke-Curl -Url "$supabaseUrl/storage/v1/object/list/$Bucket" -Method 'POST' -Body $payload `
      -OutFile $listFile -Headers @("apikey: $publicKey", "Authorization: Bearer $publicKey", 'Content-Type: application/json')
    $text = if (Test-Path -LiteralPath $listFile) { (Get-Content -LiteralPath $listFile -Raw) } else { '' }
    if (Test-Path -LiteralPath $listFile) { Remove-Item -LiteralPath $listFile -Force }
    if ($status -ne 200 -or -not $text) { return }

    $items = @($text.Trim() | ConvertFrom-Json)
    foreach ($item in $items) {
      $path = if ($Prefix) { "$Prefix/$($item.name)" } else { $item.name }
      if ($null -eq $item.id) {
        Add-StoragePrefix -Bucket $Bucket -Prefix $path -Depth ($Depth + 1)
        continue
      }

      $size = if ($item.metadata) { [int64]$item.metadata.size } else { [int64]0 }
      $encoded = ($path -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
      $destination = Join-Path $storageDir ($Bucket + '\' + ($path -replace '/', '\'))
      $destinationDir = Split-Path -Parent $destination
      if (-not (Test-Path -LiteralPath $destinationDir)) {
        New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
      }

      $downloadStatus = Invoke-Curl -Url "$supabaseUrl/storage/v1/object/public/$Bucket/$encoded" -OutFile $destination
      $actualSize = if (Test-Path -LiteralPath $destination) { (Get-Item -LiteralPath $destination).Length } else { -1 }
      $verified = ($downloadStatus -eq 200) -and ($actualSize -eq $size)
      $script:storageCount++
      if ($verified) { $script:storageBytes += $actualSize }
      $script:storageRows += [pscustomobject]@{
        bucket = $Bucket
        path = $path
        size = $size
        downloaded = $actualSize
        status = if ($verified) { 'ok' } else { "FAIL_HTTP_$downloadStatus" }
      }
    }
  }

  foreach ($bucket in @('inspection-photos', 'order-attachments')) {
    Add-StoragePrefix -Bucket $bucket -Prefix '' -Depth 0
  }
  $storageRows | Export-Csv -Path (Join-Path $runDir 'storage-manifest.csv') -NoTypeInformation -Encoding utf8
}

$metadata = [pscustomobject]@{
  createdAt = (Get-Date).ToString('o')
  mode = if ($StorageOnly) { 'storage-only' } elseif ($SkipStorage) { 'db-only' } else { 'full' }
  tables = $tableSummary
  tableRows = if ($tableSummary.Count -eq 0) { 0 } else { ($tableSummary | Measure-Object -Property rows -Sum).Sum }
  storageFiles = $storageCount
  storageBytes = $storageBytes
  storageFailures = @($storageRows | Where-Object { $_.status -ne 'ok' }).Count
}
$metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $runDir 'metadata.json') -Encoding utf8

$files = Get-ChildItem -LiteralPath $runDir -Recurse -File -Force | Where-Object { $_.Name -ne 'SHA256SUMS.txt' }
$checksums = foreach ($file in $files) {
  (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLower() + '  ' + $file.FullName.Replace($runDir + '\', '')
}
$checksums | Set-Content -LiteralPath (Join-Path $runDir 'SHA256SUMS.txt') -Encoding utf8

if ($tableSummary.Count -gt 0) {
  $tableSummary | Format-Table -AutoSize
}
"备份目录      : $runDir"
"模式          : $($metadata.mode)"
"数据库行数    : $($metadata.tableRows)（21 张表）"
"Storage 文件  : $storageCount 个 / $([math]::Round($storageBytes / 1MB, 2)) MB（失败 $($metadata.storageFailures)）"
"校验文件      : $runDir\SHA256SUMS.txt"

$failedTables = @($tableSummary | Where-Object { $_.status -ne 'ok' })
if ($failedTables.Count -gt 0) {
  "存在异常表：$($failedTables.table -join ', ')"
  exit 2
}
if ($metadata.storageFailures -gt 0) {
  "存在下载失败的 Storage 文件，详见 storage-manifest.csv"
  exit 2
}
exit 0
