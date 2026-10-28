#!/bin/sh
# sweep all steps of the given lessons, report console errors
EDGE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
for spec in "$@"; do
  lesson=${spec%%:*}; n=${spec##*:}
  i=0
  while [ $i -lt $n ]; do
    out=$("$EDGE" --headless=new --disable-gpu --enable-logging=stderr --v=0 --window-size=1200,900 --virtual-time-budget=3500 --dump-dom "http://localhost:8160/?lesson=$lesson&step=$i&pause=1&do=1&run=1&end=1&ans=1&choice=0" 2>&1)
    errs=$(echo "$out" | grep -i "CONSOLE" | grep -iv "ProtocolLaunch" | head -3)
    title=$(echo "$out" | grep -o 'ls-stitle">[^<]*' | head -1)
    echo "$lesson step $i: $title ${errs:+ERR: $errs}"
    i=$((i+1))
  done
done
