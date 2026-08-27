"""시군구 라벨 앵커 포인트 생성 (Phase T 4순위).

왜 필요한가:
  렌더링용 경계(sgg_kr_render.json)를 그대로 symbol 레이어에 물리면, MultiPolygon
  피처는 **파트마다 라벨이 하나씩** 붙는다. 섬이 많은 시군구에서 특히 심하다 —
  실측: 여수시 6개, 통영시 7개, 고흥군 5개가 동시에 표시됐다.
  그래서 피처당 점 1개짜리 별도 소스를 미리 만들어 둔다.

앵커 선택:
  가장 큰 파트를 고르고 그 안에서 representative_point()를 쓴다.
  ⚠️ centroid 가 아니다 — 오목한 도형(해안선이 파인 시군구)에서는 centroid 가
  도형 밖으로 나갈 수 있다. representative_point()는 항상 도형 내부를 보장한다.
  (PostGIS 의 ST_PointOnSurface 와 같은 개념)

입력:  sgg_kr_render.json   (클립+단순화된 렌더링용 경계)
출력:  sgg_kr_labels.json   (230개 Point, properties: name, osm_id)

실행:  python data/kr-sgg/make_labels.py
의존:  shapely  (빌드타임 전용 — 앱 의존성 아님)
"""

import json
import os

from shapely.geometry import shape

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "sgg_kr_render.json")
DST = os.path.join(HERE, "sgg_kr_labels.json")


def main() -> None:
    with open(SRC, encoding="utf-8") as f:
        src = json.load(f)

    features = []
    for feat in src["features"]:
        geom = shape(feat["geometry"])

        # MultiPolygon 이면 가장 큰 파트만 라벨 대상으로 삼는다.
        # (섬 하나하나에 이름을 붙이지 않기 위함)
        if geom.geom_type == "MultiPolygon":
            part = max(geom.geoms, key=lambda g: g.area)
        else:
            part = geom

        point = part.representative_point()
        if not part.contains(point):
            raise SystemExit(f"앵커가 도형 밖에 있다: {feat['properties']['name']}")

        props = feat["properties"]
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(point.x, 5), round(point.y, 5)],
                },
                "properties": {"name": props["name"], "osm_id": props["osm_id"]},
            }
        )

    out = {"type": "FeatureCollection", "features": features}
    with open(DST, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(DST) / 1024
    print(f"{len(features)}개 라벨 포인트 → {os.path.basename(DST)} ({size_kb:.0f}KB)")


if __name__ == "__main__":
    main()
