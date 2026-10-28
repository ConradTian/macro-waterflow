#!/bin/sh
# usage: dshot.sh name kind "query"   kind = pad|phone
E="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
OUT="$(pwd)/tools/shots/diagram-$1.png"
if [ "$2" = "pad" ]; then
 "$E" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,900 --virtual-time-budget=8000 --screenshot="$OUT" "http://localhost:8140/tools/frame.html?w=1180&h=820&pause=1&$3" >/dev/null 2>&1
else
 "$E" --headless=new --disable-gpu --hide-scrollbars --window-size=410,964 --virtual-time-budget=8000 --screenshot="$OUT" "http://localhost:8140/tools/frame.html?w=390&h=844&pause=1&$3" >/dev/null 2>&1
fi
echo $OUT
