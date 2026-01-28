$proc = Start-Process -FilePath "node" -ArgumentList "c:\Users\uduth\Downloads\lapsus-main\lapsus-main\landslide-detector--main\server\index.js" -PassThru -NoNewWindow
Write-Host "Server process started with PID: $($proc.Id)"
# Keep the script running to keep the process alive
# This allows calling script to continue while server runs in background
$proc.WaitForExit()
