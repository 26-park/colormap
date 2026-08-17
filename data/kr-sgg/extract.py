#!/usr/bin/env python3
"""한국 시군구 경계 추출 (Phase S-2) — OpenStreetMap / ODbL 1.0.

OSM `boundary=administrative` + `admin_level=6` 229개 + 세종특별자치시
(`admin_level=4`) 1개 = 230개를 Overpass API로 받아 GeoJSON으로 조립한다.

실행:
    python extract.py            # 전체 (수집 -> 조립 -> 코드 보정)
    python extract.py --verify   # 이미 받아둔 배치의 스냅샷 일관성만 검사

해안선 클립·단순화(렌더링용)는 이 스크립트가 하지 않는다. clip.py + mapshaper 로
별도 수행한다 — 순서는 반드시 "클립 → 단순화" (README 참고):
    python clip.py <land_polygons.shp>
    npx mapshaper sgg_kr_clipped.geojson -simplify visvalingam 3% keep-shapes \
        -o precision=0.00001 format=geojson sgg_kr_render.geojson

⚠️ 절대 여러 Overpass 인스턴스를 섞지 말 것.
   2026-08-16 수집 때 재시도를 미러(kumi.systems)로 넘겼더니 요청마다 다른
   옛 스냅샷(2026-05-06 / 05-31 / 07-15)이 섞여 들어와, 20개 시군구에서
   최근 추가된 ref:KR:mois:admin 태그가 통째로 누락됐다. 더 위험한 것은
   지오메트리다 — 인접 폴리곤이 서로 다른 시점에서 오면 공유 경계가 어긋나
   틈이 생긴다. 그래서 엔드포인트를 하나로 고정하고, 모든 응답의
   <meta osm_base>가 동일한지 반드시 검사한다(check_snapshots).

의존성: 표준 라이브러리 + curl 만. (GIS 툴체인 불필요)
"""
import glob
import json
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from collections import defaultdict

# ⚠️ 단일 엔드포인트 고정 — 미러를 추가하지 말 것 (위 주석 참고)
ENDPOINT = "https://overpass-api.de/api/interpreter"
SEJONG_REL = 2349795          # 세종특별자치시 (admin_level=4)
BATCH = 10
MAX_TRY = 10
GEOM_DIR = "geom"
COORD_PRECISION = 7           # 링 이음 시 좌표 매칭 정밀도

# 울산 5개는 OSM에 ref:KR:mois:admin 이 없어 수기 보정한다.
# ⚠️ 이름(중구/남구/동구/북구)이 다른 시도와 중복되므로 osm_id로 못박는다.
MANUAL_CODES = {
    8127816: "31110",  # 울산 중구
    8127814: "31140",  # 울산 남구
    8127813: "31170",  # 울산 동구
    8127817: "31200",  # 울산 북구
    8127815: "31710",  # 울산 울주군
}


def overpass(query, out_path):
    """단일 엔드포인트로 Overpass 질의. 성공하면 True."""
    for attempt in range(MAX_TRY):
        r = subprocess.run(
            ["curl", "-s", "-G", ENDPOINT, "--data-urlencode", "data=" + query,
             "-o", out_path, "-w", "%{http_code}"],
            capture_output=True, text=True,
        )
        size = os.path.getsize(out_path) if os.path.exists(out_path) else 0
        if (r.stdout or "").strip() == "200" and size > 2000:
            return True
        time.sleep(5 + attempt * 3)   # 504(서버 과부하)가 잦다. 단순 백오프면 충분.
    return False


def fetch_master(path="sgg_master.xml"):
    """admin_level=6 관계 목록(태그만)을 받아 대상 id를 뽑는다."""
    q = ('[out:xml][timeout:600];'
         'area["ISO3166-1"="KR"][admin_level=2]->.a;'
         'rel(area.a)["boundary"="administrative"]["admin_level"="6"];'
         'out tags;')
    if not overpass(q, path):
        sys.exit("master 목록 수집 실패")
    rels = ET.parse(path).getroot().findall("relation")
    ids = [int(r.get("id")) for r in rels]
    print(f"admin_level=6: {len(ids)}개")
    ids.append(SEJONG_REL)        # ⭐ 세종은 level 6에 없다. 빠지면 지도에 구멍이 생긴다.
    return ids


def fetch_geometry(ids):
    os.makedirs(GEOM_DIR, exist_ok=True)
    batches = [ids[i:i + BATCH] for i in range(0, len(ids), BATCH)]
    for bi, batch in enumerate(batches):
        out = f"{GEOM_DIR}/b{bi:03d}.xml"
        if os.path.exists(out) and os.path.getsize(out) > 2000:
            continue
        q = "[out:xml][timeout:600];rel(id:%s);out geom;" % ",".join(map(str, batch))
        if not overpass(q, out):
            sys.exit(f"배치 {bi} 수집 실패")
        print(f"  b{bi:03d} OK {os.path.getsize(out) / 1024:.0f}KB")


def check_snapshots():
    """모든 배치가 같은 osm_base 스냅샷인지 검사한다. 다르면 즉시 중단."""
    seen = defaultdict(list)
    for p in sorted(glob.glob(f"{GEOM_DIR}/b*.xml")):
        meta = ET.parse(p).getroot().find("meta")
        seen[meta.get("osm_base") if meta is not None else "?"].append(os.path.basename(p))
    if len(seen) != 1:
        print("⚠️ 스냅샷이 섞였다 — 해당 배치를 지우고 다시 받을 것:")
        for ts, files in sorted(seen.items()):
            print(f"   {ts}: {len(files)}개  {files[:5]}")
        sys.exit(1)
    ts = next(iter(seen))
    print(f"스냅샷 일관성 OK — 전부 {ts} ({len(seen[ts])}배치)")
    return ts


def _key(p):
    return (round(p[0], COORD_PRECISION), round(p[1], COORD_PRECISION))


def stitch(ways):
    """way 좌표열 목록 -> 닫힌 링 목록 + 닫히지 않은 잔여물."""
    pool = [list(w) for w in ways if len(w) >= 2]
    rings, leftovers = [], []
    while pool:
        ring = pool.pop(0)
        progress = True
        while _key(ring[0]) != _key(ring[-1]) and progress:
            progress = False
            for i, w in enumerate(pool):
                if _key(w[0]) == _key(ring[-1]):
                    ring += w[1:]
                elif _key(w[-1]) == _key(ring[-1]):
                    ring += list(reversed(w))[1:]
                elif _key(w[-1]) == _key(ring[0]):
                    ring = w[:-1] + ring
                elif _key(w[0]) == _key(ring[0]):
                    ring = list(reversed(w))[:-1] + ring
                else:
                    continue
                pool.pop(i)
                progress = True
                break
        if _key(ring[0]) == _key(ring[-1]) and len(ring) >= 4:
            rings.append(ring)
        else:
            leftovers.append(ring)
    return rings, leftovers


def ring_area(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(s) / 2.0


def point_in_ring(ring, pt):
    x, y = pt
    inside = False
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


def assemble(ids):
    wanted = set(ids)
    feats, broken = [], []
    for path in sorted(glob.glob(f"{GEOM_DIR}/b*.xml")):
        for rel in ET.parse(path).getroot().findall("relation"):
            rid = int(rel.get("id"))
            if rid not in wanted:
                continue
            tags = {t.get("k"): t.get("v") for t in rel.findall("tag")}
            by_role = defaultdict(list)
            for m in rel.findall("member"):
                if m.get("type") != "way":
                    continue
                coords = [(float(n.get("lon")), float(n.get("lat")))
                          for n in m.findall("nd")]
                if coords:
                    by_role[m.get("role") or "outer"].append(coords)

            outers, open_o = stitch(by_role.get("outer", []))
            inners, open_i = stitch(by_role.get("inner", []))
            if open_o or open_i:
                broken.append((rid, tags.get("name")))

            outers.sort(key=ring_area, reverse=True)
            polys = [[o] for o in outers]
            for ir in inners:                       # inner 링을 포함 outer에 배정
                for pi, o in enumerate(outers):
                    if point_in_ring(o, ir[0]):
                        polys[pi].append(ir)
                        break

            code10 = tags.get("ref:KR:mois:admin") or ""
            if ";" in code10:                       # 세종: "시도코드;시군구코드"
                code10 = code10.split(";")[-1]
            source = "osm" if code10 else None
            if rid in MANUAL_CODES:                 # 울산 5개 보정
                code10 = MANUAL_CODES[rid] + "00000"
                source = "manual"

            feats.append({
                "type": "Feature",
                "properties": {
                    "osm_id": rid,
                    "name": tags.get("name"),
                    # ⚠️ 인천 신설 4개(제물포·영종·서해·검단)는 MOIS 고시 코드 미확인이라
                    #    None 이다. 추측값을 넣지 말 것 — 틀린 코드가 NULL보다 나쁘다.
                    "sgg_code": code10[:5] if code10 else None,
                    "mois_admin": code10 or None,
                    "admin_level": int(tags.get("admin_level", 0)),
                    "code_source": source,
                },
                "geometry": {"type": "MultiPolygon", "coordinates": polys},
            })

    feats.sort(key=lambda f: (f["properties"]["sgg_code"] or "zzzzz",
                              f["properties"]["name"] or ""))
    missing = wanted - {f["properties"]["osm_id"] for f in feats}
    print(f"조립: {len(feats)}개 / 열린 링 {len(broken)}건 / 누락 {len(missing) or '없음'}")
    if broken:
        sys.exit(f"열린 링이 남았다: {broken}")
    if missing:
        sys.exit(f"누락된 관계: {missing}")
    return feats


def main():
    if "--verify" in sys.argv:
        check_snapshots()
        return
    ids = fetch_master()
    fetch_geometry(ids)
    check_snapshots()                 # ⭐ 조립 전에 반드시 통과해야 한다
    feats = assemble(ids)
    with open("sgg_kr_raw.geojson", "w", encoding="utf-8") as fp:
        json.dump({"type": "FeatureCollection", "features": feats},
                  fp, ensure_ascii=False)
    have = sum(1 for f in feats if f["properties"]["sgg_code"])
    print(f"코드 보유 {have}/{len(feats)} — 결측: "
          f"{[f['properties']['name'] for f in feats if not f['properties']['sgg_code']]}")
    print("-> sgg_kr_raw.geojson")


if __name__ == "__main__":
    main()
