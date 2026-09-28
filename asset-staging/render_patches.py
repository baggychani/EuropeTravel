from pathlib import Path
import json
from PIL import Image,ImageDraw,ImageChops,ImageFilter
ROOT=Path(r'C:\Users\c\Documents\Coding Projects\Europe_1year\asset-staging')
source=json.loads((ROOT/'ne_10m_land.geojson').read_text(encoding='utf-8'))
polys=[]
for f in source['features']:
 g=f['geometry']; polys.extend(g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']])
def render(name,west,south,east,north,W,H):
 S=2
 mask=Image.new('L',(W*S,H*S),0); d=ImageDraw.Draw(mask)
 def points(ring):return [((lon-west)/(east-west)*W*S,(north-lat)/(north-south)*H*S) for lon,lat in ring]
 for poly in polys:
  # Only skip when bounding boxes do not overlap. Large continent polygons
  # legitimately surround the regional viewport even with vertices outside.
  lng=[p[0] for p in poly[0]]; lat=[p[1] for p in poly[0]]
  if max(lng)<west or min(lng)>east or max(lat)<south or min(lat)>north: continue
  d.polygon(points(poly[0]),fill=255)
  for hole in poly[1:]: d.polygon(points(hole),fill=0)
 mask=mask.resize((W,H),Image.Resampling.LANCZOS)
 edge=ImageChops.subtract(mask,mask.filter(ImageFilter.MinFilter(3))).point(lambda v:round(v*.58))
 color=Image.composite(Image.new('RGB',(W,H),'#f0ebdd'),Image.new('RGB',(W,H),'#8bb4c2'),mask)
 color=Image.composite(Image.new('RGB',(W,H),'#d6d8ca'),color,edge)
 file=ROOT/(name+'.png'); color.save(file,optimize=True)
 print(file.name, W,H,file.stat().st_size)
 return {'file':file.name,'bounds':{'west':west,'south':south,'east':east,'north':north},'size':[W,H],'projection':'equirectangular EPSG:4326; north at top'}
patches=[render('globe-patch-barcelona',0,40,4,43,2048,1536),render('globe-patch-iberia-morocco',-12,30,5,45,4096,3614)]
(ROOT/'globe-patches.json').write_text(json.dumps(patches,indent=2),encoding='utf-8')
