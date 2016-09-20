#!/bin/bash -x
cd /home/shippable/runSh
npm install
mkdir -p logs

if [ "$RUN_MODE" == "dev" ]; then
  echo forever is watching file changes
  forever -w -v app.js
else
  echo forever is NOT watching file changes
  node app.js
fi
