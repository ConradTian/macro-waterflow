#!/bin/sh
# usage: shot_cycle_tab.sh name t width height [theme] [mode]
E="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
"$E" --headless=new --disable-gpu --hide-scrollbars --window-size=$3,$4 --virtual-time-budget=8000 --screenshot="$(pwd)/tools/shots/cycle-$1.png" "http://localhost:8150/tools/cycle-preview.html?t=$2&w=$(( $3 - 20 ))&theme=${5:-light}&mode=${6:-history}" >/dev/null 2>&1
