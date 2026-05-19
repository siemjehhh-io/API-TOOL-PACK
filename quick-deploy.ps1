# Define variables
$User = "kuyaba"
$RemoteHost = "52.184.18.93"
$RemotePath = "/home/kuyaba/qris-tool"
$LocalBuildPath = "dist/public/*"

# Copy files to VPS
scp -r $LocalBuildPath $User@$RemoteHost:$RemotePath

# Reload server
ssh $User@$RemoteHost "sudo systemctl reload nginx"
