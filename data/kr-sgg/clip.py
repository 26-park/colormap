"""S-5a: 시군구 경계를 해안선(OSM land polygons)으로 클립.

⭐ 렌더링 전용 산출물이다. PostGIS 판정용 원본(sgg_kr_raw.geojson)은 건드리지 않는다
   — 해변/부두/선상 좌표가 NULL 로 떨어지면 안 되기 때문.

pyshp 로 셰이프파일을 스트리밍하며 레코드별 bbox 로 한국분만 고른다
(셰이프파일은 폴리곤 레코드마다 bbox 를 저장하므로 전체를 메모리에 올릴 필요가 없다).
육지 union 은 오래 걸리므로(약 4분) WKB 로 캐시해 재실행 시 건너뛴다.
"""
import json
import os
import sys
import time

import shapefile
from shapely import make_valid, wkb
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import unary_union

SHP = sys.argv[1] if len(sys.argv) > 1 else "land-polygons-complete-4326/land_polygons.shp"
SRC = r"C:/Users/min98/colormap/data/kr-sgg/sgg_kr_raw.geojson"
OUT = "sgg_kr_clipped.geojson"
CACHE = "land_kr_union.wkb"

# 한국 전체를 넉넉히 감싸는 bbox (백령도 124.6 / 마라도 33.06 / 독도 131.87 포함)
KR = (124.0, 32.5, 132.5, 39.0)


def bbox_hits(b):
    return not (b[2] < KR[0] or b[0] > KR[2] or b[3] < KR[1] or b[1] > KR[3])


def build_land():
    reader = shapefile.Reader(SHP)
    total = len(reader)
    print(f"land polygons: {total:,} records — 스트리밍 필터 시작")
    parts = []
    for i, s in enumerate(reader.iterShapes()):
        if i and i % 200000 == 0:
            print(f"  {i:,}/{total:,} 스캔 ({len(parts)} 채택, {time.time()-t0:.0f}s)")
        if not bbox_hits(s.bbox):
            continue
        g = shape(s.__geo_interface__)
        if not g.is_valid:
            g = make_valid(g)
        parts.append(g)
    reader.close()
    print(f"한국 bbox 내 육지 폴리곤 {len(parts)}개 채택 ({time.time()-t0:.0f}s)")
    merged = unary_union(parts)
    with open(CACHE, "wb") as fp:
        fp.write(wkb.dumps(merged))
    print(f"union 완료 · 캐시 저장 ({time.time()-t0:.0f}s)")
    return merged


t0 = time.time()
if os.path.exists(CACHE):
    land = wkb.loads(open(CACHE, "rb").read())
    print(f"육지 union 캐시 사용 ({CACHE})")
else:
    land = build_land()

src = json.load(open(SRC, encoding="utf-8"))
out_feats, dropped = [], []
for f in src["features"]:
    g = shape(f["geometry"])
    if not g.is_valid:
        g = make_valid(g)
    clipped = g.intersection(land)
    # intersection 이 GeometryCollection(선/점 섞임)을 낼 수 있다 — 폴리곤만 남긴다
    if clipped.geom_type == "GeometryCollection":
        polys = [p for p in clipped.geoms if p.geom_type in ("Polygon", "MultiPolygon")]
        clipped = unary_union(polys) if polys else clipped
    if clipped.is_empty:
        dropped.append(f["properties"]["name"])
        continue
    if clipped.geom_type == "Polygon":
        clipped = MultiPolygon([clipped])
    out_feats.append({
        "type": "Feature",
        "properties": f["properties"],
        "geometry": mapping(clipped),
    })

json.dump({"type": "FeatureCollection", "features": out_feats},
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print(f"클립 완료: {len(out_feats)}개 (빈 결과 {len(dropped)}개: {dropped or '없음'})")
print(f"-> {OUT}  ({time.time()-t0:.0f}s)")
