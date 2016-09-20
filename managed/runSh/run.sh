#!/bin/bash -e

main() {
  echo "----> Node Version"
  node --version
  echo "----> Install npm packages"
  npm install
  echo "----> Run Sh"
  node runSh.js
}

main
