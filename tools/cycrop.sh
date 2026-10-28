#!/bin/sh
# usage: cycrop.sh in.png x y w h [scale]   crop a region (in CSS px of the 1.5x shot) and upscale
"C:/Users/Kanglin.Tian/.venvs/dalio432/Scripts/python.exe" -c "
import sys
from PIL import Image
im=Image.open(sys.argv[1]); x,y,w,h=[int(float(v)*1.5) for v in sys.argv[2:6]]; s=float(sys.argv[6]) if len(sys.argv)>6 else 2
c=im.crop((x,y,x+w,y+h)); c=c.resize((int(c.width*s),int(c.height*s))); c.save(sys.argv[1].replace('.png','-crop.png'))" "$@"
