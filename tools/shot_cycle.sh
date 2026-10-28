#!/bin/sh
# usage: shot_cycle.sh name device t   (device: ipad|phone)
E="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
if [ "$2" = "ipad" ]; then SZ=1200,900; Q="w=1180&h=820"; else SZ=410,964; Q="w=390&h=844"; fi
"$E" --headless=new --disable-gpu --hide-scrollbars --window-size=$SZ --virtual-time-budget=8000 --screenshot="$(pwd)/tools/shots/cycle-$1.png" "http://localhost:8150/tools/frame.html?$Q&t=$3&pause=1&tab=cycle" >/dev/null 2>&1
