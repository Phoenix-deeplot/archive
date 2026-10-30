"""Independent check of an exported backup: a real zip reader (not ours), then a deflated re-pack of the same files for the import test."""
import json
import sys
import zipfile

src, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src)
res = {'testzip': z.testzip(), 'names': z.namelist()}
m = json.loads(z.read('shelf.json'))
res['format'] = m['format']
res['items'] = len(m['items'])
res['withFiles'] = m['withFiles']
res['state_keys'] = sorted(m['state'].keys())
files = {i['id']: i.get('file') for i in m['items']}
res['file_of'] = files
md = [i for i in m['items'] if i['type'] == 'md'][0]
res['md_text'] = z.read(md['file']).decode('utf-8')
pdf = [i for i in m['items'] if i['type'] == 'pdf'][0]
data = z.read(pdf['file'])
res['pdf_len'] = len(data)
res['pdf_head'] = data[:8].decode('latin-1')
res['pdf_pattern_ok'] = all(data[i] == i % 251 for i in range(40, len(data)))
res['unicode_names_flag'] = [bool(i.flag_bits & 0x800) for i in z.infolist()][:3]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as d:         # the same files, compressed the way other tools do it
    for n in z.namelist():
        d.writestr(n, z.read(n))
res['deflated_methods'] = sorted({i.compress_type for i in zipfile.ZipFile(out).infolist()})
print(json.dumps(res, ensure_ascii=False))
