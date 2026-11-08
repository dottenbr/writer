import hashlib, os, pathlib, sys, zipfile
root=pathlib.Path(sys.argv[1]);archive=sys.argv[2]
expected={}
for parent,dirs,files in os.walk(root):
 dirs[:]=[d for d in dirs if d not in {'.git','__pycache__','node_modules'}]
 for name in files:
  if name=='.DS_Store' or name.endswith('.pyc'):continue
  p=pathlib.Path(parent)/name;expected[p.relative_to(root).as_posix()]=p
with zipfile.ZipFile(archive) as z:
 actual={f.filename:f for f in z.infolist() if not f.is_dir()}
 assert actual.keys()==expected.keys(),f'Inventory mismatch: missing={expected.keys()-actual.keys()}, extra={actual.keys()-expected.keys()}'
 for name,p in expected.items():
  info=actual[name];assert info.file_size==p.stat().st_size,name+' size'
  assert info.external_attr>>16==p.stat().st_mode,name+' mode'
  with p.open('rb') as src,z.open(info) as dst:
   assert hashlib.file_digest(src,'sha256').digest()==hashlib.file_digest(dst,'sha256').digest(),name+' content'
print(f'PASS {root.name}: {len(expected)} paths, bytes, sizes and Unix modes')
