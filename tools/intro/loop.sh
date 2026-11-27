#!/usr/bin/env bash
# Заставка по кругу: склейка роликов через фейд и бесшовный круг (конец плавно переходит в начало).
# ./loop.sh out.webm part1.mp4 part2.mp4 [part3.mp4 ...]   FADE=1.0 HEIGHT=1080 FPS=30
# AUDIO=out.ogg — ещё и звук роликов тем же кругом (громкость выровнена), иначе видео без звука
set -euo pipefail
OUT=$1; shift
F=${FADE:-1.0}; H=${HEIGHT:-1080}; R=${FPS:-30}
n=$#; [ $n -ge 1 ] || { echo "нужен хотя бы один ролик"; exit 1; }
args=(); for f in "$@"; do args+=(-i "$f"); done
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
# 1) общий размер и частота, без звука (звук — отдельно, музыкой)
pre=""; for i in $(seq 0 $((n-1))); do pre+="[$i:v]scale=-2:$H,fps=$R,format=yuv420p,setsar=1[v$i];"; done
# 2) цепочка xfade между частями
chain=""; last="v0"; off=0
for i in $(seq 1 $((n-1))); do
  d=$(dur "${@:$i:1}"); off=$(python3 -c "print($off + $d - $F)")
  chain+="[$last][v$i]xfade=transition=fade:duration=$F:offset=$off[x$i];"; last="x$i"
done
ffmpeg -v error -y "${args[@]}" -filter_complex "${pre}${chain}[$last]null[out]" -map "[out]" -c:v libx264 -crf 16 -preset fast /tmp/intro_chain.mp4
# 3) круг без шва: хвост длиной F плавно перетекает в голову; итог короче на F
T=$(dur /tmp/intro_chain.mp4)
ffmpeg -v error -y -i /tmp/intro_chain.mp4 -filter_complex \
 "[0:v]split[a][b];[a]trim=start=$F,setpts=PTS-STARTPTS[body];[b]trim=0:$F,setpts=PTS-STARTPTS[head];\
  [body][head]xfade=transition=fade:duration=$F:offset=$(python3 -c "print($T - 2*$F)")[o]" \
 -map "[o]" -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -an "$OUT"
echo "готово: $OUT ($(dur "$OUT") с), круг без шва"
# 4) звук тем же кругом: склейка через acrossfade, хвост перетекает в голову, громкость к −20 дБ в среднем
if [ -n "${AUDIO:-}" ]; then
  pa=""; for i in $(seq 0 $((n-1))); do pa+="[$i:a]aresample=48000,aformat=channel_layouts=stereo[a$i];"; done
  ac=""; la="a0"; for i in $(seq 1 $((n-1))); do ac+="[$la][a$i]acrossfade=d=$F:c1=tri:c2=tri[y$i];"; la="y$i"; done
  ffmpeg -v error -y "${args[@]}" -filter_complex "${pa}${ac}[$la]anull[ao]" -map "[ao]" -c:a pcm_s16le /tmp/intro_chain.wav
  TA=$(dur /tmp/intro_chain.wav)
  # два входа одного файла: с asplit acrossfade ждёт конца первой ветки и встаёт
  ffmpeg -v error -y -i /tmp/intro_chain.wav -i /tmp/intro_chain.wav -filter_complex \
   "[0:a]atrim=start=$F,asetpts=PTS-STARTPTS[body];[1:a]atrim=0:$F,asetpts=PTS-STARTPTS[head];\
    [body][head]acrossfade=d=$F:c1=tri:c2=tri,loudnorm=I=-20:TP=-3:LRA=11[o]" -map "[o]" -ar 48000 -c:a libopus -b:a 112k "$AUDIO"
  echo "звук: $AUDIO ($(dur "$AUDIO") с)"
fi
