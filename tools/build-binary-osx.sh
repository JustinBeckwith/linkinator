#!/bin/bash
BIN_PATH="./build/binaries"
OSX_PATH="${BIN_PATH}/osx"
EXE_PATH="${OSX_PATH}/linkinator"
mkdir -p $OSX_PATH
node --experimental-sea-config sea-config.json
cp -f $(command -v node) $EXE_PATH
chmod +rw $EXE_PATH
codesign --remove-signature $EXE_PATH
npx postject $EXE_PATH NODE_SEA_BLOB $BIN_PATH/sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA
codesign --sign - $EXE_PATH
