#!/bin/sh
# usage: dcrop.sh name "query" x y w h  (phone @2x, cropped)
E="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
OUT="$(pwd -W)/tools/shots/diagram-$1-2x.png"
"$E" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=410,964 --virtual-time-budget=8000 --screenshot="$OUT" "http://localhost:8140/tools/frame.html?w=390&h=844&pause=1&$2" >/dev/null 2>&1
"C:/Users/Kanglin.Tian/.venvs/dalio432/Scripts/python.exe" -c "
from PIL import Image
im=Image.open(r'$OUT'); im.crop(($3,$4,$3+$5,$4+$6)).save(r'$OUT')
print(im.size)"
