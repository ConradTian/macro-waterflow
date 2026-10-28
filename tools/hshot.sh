#!/bin/sh
# usage: hshot.sh name kind "query" [src]   kind = pad|phone ; src defaults to ../ ; PNG -> tools/shots/h-<name>.png (port 8177)
E="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
OUT="$(pwd)/tools/shots/h-$1.png"
S="${4:-../}"
if [ "$2" = "pad" ]; then
 "$E" --headless=new --disable-gpu --hide-scrollbars --window-size=1044,788 --virtual-time-budget=9000 --screenshot="$OUT" "http://localhost:8177/tools/frame.html?w=1024&h=768&pause=1&src=$S&$3" >/dev/null 2>&1
else
 "$E" --headless=new --disable-gpu --hide-scrollbars --window-size=410,864 --virtual-time-budget=9000 --screenshot="$OUT" "http://localhost:8177/tools/frame.html?w=390&h=844&pause=1&src=$S&$3" >/dev/null 2>&1
fi
echo $OUT
