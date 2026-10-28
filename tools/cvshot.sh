#!/bin/sh
# usage: cvshot.sh name kind "query"   kind = pad|phone   (serve the repo root on :8174 first: python -m http.server 8174)
E="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
OUT="$(pwd)/tools/shots/cv-$1.png"
if [ "$2" = "pad" ]; then
 "$E" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,900 --virtual-time-budget=${BUDGET:-8000} --screenshot="$OUT" "http://localhost:8174/tools/frame.html?w=1024&h=768&pause=1&$3" >/dev/null 2>&1
else
 "$E" --headless=new --disable-gpu --hide-scrollbars --window-size=410,964 --virtual-time-budget=${BUDGET:-8000} --screenshot="$OUT" "http://localhost:8174/tools/frame.html?w=390&h=844&pause=1&$3" >/dev/null 2>&1
fi
echo $OUT
