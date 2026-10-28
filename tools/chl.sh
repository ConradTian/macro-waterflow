#!/bin/sh
# usage: chl.sh name term [phone]
D="$(pwd)/tools/shots"
if [ "$3" = "phone" ]; then SZ=410,964; Q="w=390&h=844"; else SZ=1200,900; Q="w=1180&h=820"; fi
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=$SZ --virtual-time-budget=8000 --screenshot="$D/chl-$1.png" "http://localhost:8180/tools/frame.html?$Q&t=56&pause=1&term=$2$EXTRA" >/dev/null 2>&1
