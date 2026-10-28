#!/bin/sh
# usage: cyshot.sh name kind(phone|pad|tall|padtall) theme(light|dark) "query"   (serve repo root: python -m http.server 8176)
#  phone/pad = full app via tools/frame.html (2x);  tall/padtall = the 周期 tab alone at full height via tools/cycle-preview.html
E="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
OUT="$(pwd -W)/tools/shots/pin-$1-$2-$3.png"
case "$2" in
 pad) U="tools/frame.html?w=1024&h=768&theme=$3&$4"; WS="1044,868";;
 phone) U="tools/frame.html?w=390&h=844&theme=$3&$4"; WS="410,964";;
 tall) U="tools/cycle-preview.html?w=390&theme=$3&$4"; WS="410,2700";;
 padtall) U="tools/cycle-preview.html?w=520&theme=$3&$4"; WS="560,2200";;
esac
"$E" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=${DPR:-1.5} --window-size=$WS --virtual-time-budget=8000 --screenshot="$OUT" "http://localhost:8176/$U" >/dev/null 2>&1
echo $OUT
