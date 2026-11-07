#!/bin/zsh
# Assemble the Fetch.ai video from out/f*.mp3 + cards/footage. Optional: ASI_REC=<screen recording> replaces scene 9.
set -e; cd "$(dirname $0)/out"
D(){ ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
V=(-c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -b:a 160k -ar 44100 -ac 2)
T(){ python3 -c "print(round($(D f$1.mp3)+0.7,2))"; }
still(){ ffmpeg -v error -y -loop 1 -i $2 -i f$1.mp3 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0f1419,format=yuv420p" -af apad -t $(T $1) $V fs$1.mp4; }
stillcap(){ ffmpeg -v error -y -loop 1 -i $2 -i $3 -i f$1.mp3 -filter_complex "[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0f1419[b];[b][1:v]overlay=0:0,format=yuv420p[v];[2:a]apad[a]" -map "[v]" -map "[a]" -t $(T $1) $V fs$1.mp4; }
clip(){ local t=$(T $1); local r=$(python3 -c "print($t/$(D $2))"); ffmpeg -v error -y -i $2 -i $3 -i f$1.mp3 -filter_complex "[0:v]setpts=PTS*${r},scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0f1419[b];[b][1:v]overlay=0:0,format=yuv420p[v];[2:a]apad[a]" -map "[v]" -map "[a]" -t $t $V fs$1.mp4; }
still 01 fc01.png; still 02 fc02.png
clip 03 ../../prepared/validate.webm capf3.png
still 04 card2.png
stillcap 05 gh-wall.png capf5.png
clip 06 app.webm capf6.png
# 07: chart for the first half, README table for the second
t7=$(T 07); h=$(python3 -c "print($t7/2)")
ffmpeg -v error -y -loop 1 -t $h -i card4.png -loop 1 -t $h -i gh-results.png -i capf7.png -i f07.mp3 -filter_complex "[0:v]format=yuv420p[a0];[1:v][2:v]overlay=0:0,format=yuv420p[a1];[a0][a1]concat=n=2:v=1:a=0[v];[3:a]apad[a]" -map "[v]" -map "[a]" -t $t7 $V fs07.mp4
still 08 fc08.png
if [[ -n "$ASI_REC" ]]; then clip 09 "$ASI_REC" capf6.png; else still 09 card5.png; fi
still 10 fc10.png; still 11 fc11.png; still 12 fc12.png
printf "file fs%s.mp4\n" 01 02 03 04 05 06 07 08 09 10 11 12 > flist.txt
ffmpeg -v error -y -f concat -safe 0 -i flist.txt -c copy resurrect-fetch.mp4
echo "resurrect-fetch.mp4 $(D resurrect-fetch.mp4) s"
