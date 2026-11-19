$ErrorActionPreference = 'Stop'
$src = 'D:\叉叉机\叉叉机\index.html'
$enc = [System.Text.Encoding]::GetEncoding(936)

# 1) 穷举所有双字节组合，建立「字符 -> 原始字节」反查表（覆盖编码器拒收的 PUA 码位）
$rev = New-Object 'System.Collections.Generic.Dictionary[string,byte[]]'
for ($b1 = 0x81; $b1 -le 0xFE; $b1++) {
  for ($b2 = 0x40; $b2 -le 0xFE; $b2++) {
    if ($b2 -eq 0x7F) { continue }
    $pair = [byte[]]@([byte]$b1, [byte]$b2)
    $ch = $enc.GetString($pair)
    if ($ch.Length -eq 1 -and $ch -ne '?' -and $ch -ne [char]0xFFFD) {
      if (-not $rev.ContainsKey($ch)) { $rev[$ch] = $pair }
    }
  }
}
for ($b = 0; $b -le 0x7F; $b++) {
  $rev[[string][char]$b] = [byte[]]@([byte]$b)
}
$euro = $enc.GetString([byte[]]@([byte]0x80))
if ($euro.Length -eq 1) { $rev[$euro] = [byte[]]@([byte]0x80) }
"map_size=$($rev.Count)"

# 2) 逐字符还原原始字节流
$s = [System.IO.File]::ReadAllText($src, [System.Text.Encoding]::UTF8)
$ms = New-Object System.IO.MemoryStream
$missing = New-Object 'System.Collections.Generic.Dictionary[string,int]'
foreach ($ch in $s.ToCharArray()) {
  $k = [string]$ch
  $b = $null
  if ($rev.TryGetValue($k, [ref]$b)) { $ms.Write($b, 0, $b.Length) }
  else { if ($missing.ContainsKey($k)) { $missing[$k]++ } else { $missing[$k] = 1 } }
}
$bytes = $ms.ToArray()
"bytes=$($bytes.Length)"
"missing_kinds=$($missing.Count)"
$missing.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 15 | ForEach-Object { "  missing U+{0:X4} x{1}" -f [int][char]$_.Key, $_.Value }

# 3) 按 UTF-8 解码成原文
$orig = [System.Text.Encoding]::UTF8.GetString($bytes)
[System.IO.File]::WriteAllText('D:\叉叉机\_recover.html', $orig, (New-Object System.Text.UTF8Encoding($false)))
"recovered_chars=$($orig.Length)"
"has_chacha_ji=$($orig.Contains([string]([char]0x53C9 + [char]0x53C9 + [char]0x673A)))"
"fffd=$(([regex]::Matches($orig,[char]0xFFFD)).Count)"
"title=$(([regex]::Match($orig,'<title>[\s\S]{0,40}')).Value)"
