#!/bin/sh
# usage: shot.sh name "query"
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=410,964 --virtual-time-budget=8000 --screenshot="$(pwd)/tools/shots/lesson-$1.png" "http://localhost:8120/tools/frame.html?w=390&h=844&$2" >/dev/null 2>&1
