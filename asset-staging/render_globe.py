from pathlib import Path
import json
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(r'C:\Users\c\Documents\Coding Projects\Europe_1year\asset-staging')
W,H,S=8192,4096,2
source=json.loads((ROOT/'ne_10m_land.geojson').read_text(encoding='utf-8'))
polys=[]
for feature in source['features']:
    g=feature['geometry']
    polys.extend(g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']])
mask=Image.new('L',(W*S,H*S),0)
draw=ImageDraw.Draw(mask)
def points(ring): return [((lon+180)/360*W*S,(90-lat)/180*H*S) for lon,lat in ring]
# Natural Earth geometries already split at +/-180. Antarctica includes its
# pole closure; keeping that ring intact correctly fills to south edge.
for poly in polys:
    draw.polygon(points(poly[0]),fill=255)
    for hole in poly[1:]: draw.polygon(points(hole),fill=0)
mask=mask.resize((W,H),Image.Resampling.LANCZOS)
# Subpixel coast edge, kept inside the land silhouette to avoid heavy outlines.
eroded=mask.filter(ImageFilter.MinFilter(3))
from PIL import ImageChops
edge=ImageChops.subtract(mask,eroded).point(lambda v:round(v*.58))
color=Image.composite(Image.new('RGB',(W,H),'#f0ebdd'),Image.new('RGB',(W,H),'#8bb4c2'),mask)
color=Image.composite(Image.new('RGB',(W,H),'#d6d8ca'),color,edge)
color.save(ROOT/'globe-color-8192.png',optimize=True)
mask.filter(ImageFilter.GaussianBlur(.55)).save(ROOT/'globe-land-bump-8192.png',optimize=True)
color.resize((2048,1024),Image.Resampling.LANCZOS).save(ROOT/'globe-color-preview.png')
# Thumbnail of the area that will be used in the prototype, for texture QA.
def x(lon):return int((lon+180)/360*W)
def y(lat):return int((90-lat)/180*H)
color.crop((x(-13),y(49),x(12),y(27))).resize((1100,968),Image.Resampling.LANCZOS).save(ROOT/'globe-europe-coast-preview.png')
report={'projection':'equirectangular EPSG:4326, longitude -180..180 left to right, latitude +90..-90 top to bottom','size':[W,H],'land':'#f0ebdd','ocean':'#8bb4c2','coast':'#d6d8ca','source':'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson','license':'Public domain; https://www.naturalearthdata.com/about/terms-of-use/','notes':['Natural Earth 1:10m land geometry, no political borders, no satellite/terrain/text.','2x supersampled land mask; subtle coast stroke.','Three.js color texture should use SRGBColorSpace. Bump is linear data; recommended bumpScale very small (0.0004 to 0.001 times globe radius).','Global 8K texture is about 4.9 km per equatorial pixel; close city-to-city shots should use regional vector overlay or constrained zoom.','Full source GeoJSON is included for optional region geometry.']}
(ROOT/'globe-assets.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('\n'.join(str(f.name)+' '+str(f.stat().st_size)+' bytes' for f in ROOT.iterdir()))
