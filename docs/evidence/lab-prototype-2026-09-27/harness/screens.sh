#!/bin/sh
# Regenerates screens/ from a running `npm run preview -- --host 127.0.0.1 --port 4321`, logging to
# logs/screens.log. Run from this evidence folder: sh harness/screens.sh
set -e
export NODE_PATH="$(npm root -g)" EXT=jpg OUT=screens
run() { echo "## $1" >> logs/screens.log; shift; env "$@" node harness/proto.cjs >> logs/screens.log 2>&1; }
: > logs/screens.log
run 'desktop openings' W=1280x800,1440x900,1920x1080 STEPS=hero
run 'workstation, overview, cuCadence at 1440x900' STEPS=desk,read,overview
run 'cuCadence scrolled 900px' STEPS=read SCROLL=900 TAG=scrolled-
run 'reduced motion' REDUCE=1 STEPS=hero,desk,read TAG=reduced-
run 'phone 390x844: opening, then Selected work' W=390x844 STEPS=hero,work TAG=phone-
run 'stacked 1024x768 (4:3, below the 3:2 gate)' W=1024x768 STEPS=hero,work TAG=stacked-
