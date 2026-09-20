# Publish a GitHub Release using the locally stored git credential.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release.ps1 -Version 0.4.0
# Notes: the token is read into memory only, never printed.
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Repo = 'zzx2002/memo-book',
  [string]$NotesFile = '.release-notes.md',
  [string]$AssetDir = 'src-tauri/target/release/bundle/upload'
)

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

function Get-GitHubToken {
  $reqFile = Join-Path $env:TEMP "memo-req-$PID.txt"
  $outFile = Join-Path $env:TEMP "memo-out-$PID.txt"
  Set-Content -Path $reqFile -Value "protocol=https`nhost=github.com`n" -NoNewline -Encoding ascii
  cmd /c "git credential fill < `"$reqFile`" > `"$outFile`" 2>nul"
  $token = $null
  if (Test-Path $outFile) {
    $line = Select-String -Path $outFile -Pattern '^password=(.+)$' | Select-Object -First 1
    if ($line) { $token = $line.Matches[0].Groups[1].Value.Trim() }
  }
  Remove-Item -Force $reqFile, $outFile -ErrorAction SilentlyContinue
  return $token
}

function Invoke-GitHub {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [string]$InFile,
    [string]$ContentType
  )
  try {
    if ($InFile) {
      return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method $Method -InFile $InFile -ContentType $ContentType
    }
    return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method $Method
  } catch {
    $resp = $_.Exception.Response
    if ($resp -ne $null) {
      $code = [int]$resp.StatusCode
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $body = $reader.ReadToEnd()
      $reader.Close()
      Write-Host ("  HTTP " + $code + " -> " + $body)
    } else {
      Write-Host ("  ERROR " + $_.Exception.Message)
    }
    return $null
  }
}

$tag = "v$Version"
$token = Get-GitHubToken
if (-not $token) { Write-Host 'FAIL: no credential found; run git push once first'; exit 1 }
Write-Host ("OK credential length=" + $token.Length)

$headers = @{
  Authorization          = "Bearer $token"
  Accept                 = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
  'User-Agent'           = 'memo-book-release'
}
$api = "https://api.github.com/repos/$Repo"

$remoteTag = git ls-remote --tags origin "refs/tags/$tag" 2>$null
if (-not $remoteTag) { Write-Host "FAIL: tag $tag not on origin"; exit 1 }
Write-Host "OK tag $tag exists on origin"

# 先看 release 是否已存在：已存在就只补资产，不必再要说明文件
Write-Host '--- GET existing release ---'
$release = Invoke-GitHub -Method Get -Uri "$api/releases/tags/$tag" -Headers $headers

$bodyFile = $null
if (-not $release) {
  if (-not (Test-Path $NotesFile)) {
    Write-Host ("FAIL: notes file not found: " + $NotesFile + " (create it before the first publish)")
    exit 1
  }
  $bodyFile = Join-Path $env:TEMP "memo-body-$PID.json"
  $payload = [ordered]@{
    tag_name         = $tag
    target_commitish = 'master'
    name             = "我的记事簿 $tag"
    body             = [string](Get-Content -Raw -Encoding UTF8 $NotesFile)
    draft            = $false
    prerelease       = $false
  }
  $json = $payload | ConvertTo-Json -Depth 3
  # 防御性检查：PowerShell 5.1 的 ConvertTo-Json 可能对字符串做 ETS 属性展开，
  # 把 3KB 的说明膨胀成几百 KB 的嵌套对象（GitHub 会返回 422）。
  if ($json.Length -gt ($payload.body.Length * 4 + 1000)) {
    Write-Host ("FAIL: body JSON looks inflated (" + $json.Length + " bytes for " + $payload.body.Length + " chars)")
    exit 1
  }
  [System.IO.File]::WriteAllText($bodyFile, $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("OK body file bytes=" + (Get-Item $bodyFile).Length)
  Write-Host '--- POST create release ---'
  $release = Invoke-GitHub -Method Post -Uri "$api/releases" -Headers $headers -InFile $bodyFile -ContentType 'application/json; charset=utf-8'
}
if ($bodyFile) { Remove-Item -Force $bodyFile -ErrorAction SilentlyContinue }

if (-not $release) { Write-Host 'FAIL: release was not created'; exit 1 }
Write-Host ("OK release id=" + $release.id)

$existingAssets = @()
$list = Invoke-GitHub -Method Get -Uri "$api/releases/$($release.id)/assets" -Headers $headers
if ($list) { $existingAssets = $list }

# 清掉不属于本版本的残留资产（例如上一版忘了清空的 staging 目录传上来的文件）
foreach ($asset in $existingAssets) {
  if ($asset.name -notlike "*$Version*") {
    Write-Host ("PRUNE stale asset " + $asset.name)
    $null = Invoke-GitHub -Method Delete -Uri "$api/releases/assets/$($asset.id)" -Headers $headers
  }
}
$existing = @($existingAssets | Where-Object { $_.name -like "*$Version*" } | Select-Object -ExpandProperty name)


# 自动收集打包产物：NSIS 安装包 / MSI / 免安装 exe，统一改名后上传
# 先清空 staging 目录，否则上一次发布残留的文件会被一起传上去
if (Test-Path $AssetDir) { Remove-Item -Recurse -Force $AssetDir }
New-Item -ItemType Directory -Force -Path $AssetDir | Out-Null
# 必须按版本号过滤：bundle 目录里会留着历史版本的安装包，
# 用 -First 1 会抓到最旧的那个（曾把 0.4.0 的安装器当成 0.5.0 发出去）
$setup = Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter "*$Version*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $setup) { Write-Host "FAIL: no nsis installer for $Version found"; exit 1 }
Copy-Item $setup.FullName (Join-Path $AssetDir "MemoBook_${Version}_x64-setup.exe") -Force
$msi = Get-ChildItem 'src-tauri/target/release/bundle/msi' -Filter "*$Version*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($msi) { Copy-Item $msi.FullName (Join-Path $AssetDir "MemoBook_${Version}_x64.msi") -Force }
$portable = 'src-tauri/target/release/memo-book.exe'
if (Test-Path $portable) { Copy-Item $portable (Join-Path $AssetDir "MemoBook_${Version}_x64-portable.exe") -Force }

foreach ($file in Get-ChildItem $AssetDir -File) {
  $remote = $existingAssets | Where-Object { $_.name -eq $file.Name } | Select-Object -First 1
  if ($remote) {
    if ([int64]$remote.size -eq [int64]$file.Length) {
      Write-Host ("SKIP unchanged asset " + $file.Name)
      continue
    }
    # 同名但字节数不同 = 内容已经变了（例如上次发出去的是错的文件），删掉重传
    Write-Host ("REPLACE asset " + $file.Name + " (remote " + $remote.size + " != local " + $file.Length + ")")
    $null = Invoke-GitHub -Method Delete -Uri "$api/releases/assets/$($remote.id)" -Headers $headers
  }
  $uri = "https://uploads.github.com/repos/$Repo/releases/$($release.id)/assets?name=$($file.Name)"
  $asset = Invoke-GitHub -Method Post -Uri $uri -Headers $headers -InFile $file.FullName -ContentType 'application/octet-stream'
  if ($asset) {
    Write-Host ("OK uploaded " + $asset.name + " (" + $asset.size + " bytes)")
  } else {
    Write-Host ("FAIL uploading " + $file.Name)
  }
}

Write-Host ''
Write-Host ("RELEASE URL: " + $release.html_url)
