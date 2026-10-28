#!/bin/sh
# usage: hshot_tall.sh name "query" [height]  -> phone width 390, tall viewport so the whole tab content is visible (verification only)
E="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
H="${3:-1500}"
OUT="$(pwd)/tools/shots/h-$1.png"
"$E" --headless=new --disable-gpu --hide-scrollbars --window-size=410,$((H+20)) --virtual-time-budget=9000 --screenshot="$OUT" "http://localhost:8177/tools/frame.html?w=390&h=$H&pause=1&$2" >/dev/null 2>&1
echo $OUT
