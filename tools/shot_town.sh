#!/bin/sh
# usage: tools/shot_town.sh name pad|phone "query"   -> tools/shots/town-<name>.png   (needs: python http.server 8160 at repo root)
EDGE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
if [ "$2" = "pad" ]; then WS="1200,900"; Q="w=1180&h=820"; else WS="410,964"; Q="w=390&h=844"; fi
"$EDGE" --headless=new --disable-gpu --hide-scrollbars --window-size=$WS --virtual-time-budget=${BUDGET:-8000} --screenshot="$(pwd)/tools/shots/town-$1.png" "http://localhost:8160/tools/frame.html?$Q&$3" >/dev/null 2>&1
echo "tools/shots/town-$1.png"
