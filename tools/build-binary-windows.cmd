node -e "require('fs').copyFileSync(process.execPath, 'linkinator.exe')"
signtool remove /s linkinator.exe
npx postject linkinator.exe NODE_SEA_BLOB sea-prep.blob ^
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
signtool sign /fd SHA256 linkinator.exe
