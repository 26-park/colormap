#!/usr/bin/env python3
"""sgg_kr_raw.geojson -> public.sgg 적재 (Phase S-3).

멱등하다. `osm_relation_id` 기준 upsert 라 몇 번을 돌려도 결과가 같고,
surrogate id(`sgg.id`)도 보존된다 — 이미 그 경계를 가리키는 posts.sgg_id 가
끊기지 않는다.

⚠️ 판정용이므로 **단순화하지 않은 원본**(sgg_kr_raw.geojson)을 넣는다.
   단순화본은 렌더링 전용이다.

실행:
    cd data/kr-sgg && python load_to_db.py

7.3MB 를 한 번에 보낼 수 없어 CHUNK 개씩 나눠 보낸다. 각 청크는 자체
트랜잭션이지만 upsert 라 중간에 실패해도 다시 돌리면 이어서 채워진다.
"""
import json
import os
import subprocess
import sys
import tempfile

SRC = "sgg_kr_raw.geojson"
CHUNK = 5           # 청크당 피처 수 (요청 크기 한계 때문에 작게 유지)
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def sql_str(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def run_sql(sql):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False,
                                     encoding="utf-8") as fp:
        fp.write(sql)
        path = fp.name
    try:
        r = subprocess.run(
            ["npx", "supabase", "db", "query", "--linked", "-f", path],
            cwd=REPO_ROOT, capture_output=True, text=True, shell=True,
        )
        if r.returncode != 0 or '"_tag":"Error"' in (r.stdout or ""):
            return False, (r.stdout or "") + (r.stderr or "")
        return True, r.stdout
    finally:
        os.unlink(path)


def main():
    feats = json.load(open(SRC, encoding="utf-8"))["features"]
    print(f"{len(feats)}개 적재 시작 (청크 {CHUNK})")

    for i in range(0, len(feats), CHUNK):
        chunk = feats[i:i + CHUNK]
        values = []
        for f in chunk:
            p = f["properties"]
            values.append(
                "({},{},{},{},{},st_geomfromgeojson({})::geography)".format(
                    p["osm_id"],
                    sql_str(p["sgg_code"]),
                    sql_str(p["name"]),
                    p["admin_level"],
                    sql_str(p["code_source"]),
                    sql_str(json.dumps(f["geometry"], separators=(",", ":"))),
                )
            )
        sql = (
            "insert into public.sgg "
            "(osm_relation_id, sgg_code, name, admin_level, code_source, geom) values\n"
            + ",\n".join(values)
            + "\non conflict (osm_relation_id) do update set "
              "sgg_code = excluded.sgg_code, name = excluded.name, "
              "admin_level = excluded.admin_level, "
              "code_source = excluded.code_source, geom = excluded.geom;"
        )
        ok, out = run_sql(sql)
        n = i // CHUNK + 1
        total = (len(feats) + CHUNK - 1) // CHUNK
        if not ok:
            print(f"  청크 {n}/{total} 실패:\n{out[:600]}")
            sys.exit(1)
        print(f"  청크 {n}/{total} OK ({len(sql)/1024:.0f}KB)")

    print("적재 완료. 기존 게시물 backfill...")
    ok, out = run_sql(
        # 트리거가 아니라 명시 UPDATE 로 채운다. (UPDATE 자체가 트리거를 다시
        # 태우지만 같은 값이라 결과는 동일하다.)
        "update public.posts p set sgg_id = s.id from public.sgg s "
        "where st_covers(s.geom, p.location) and p.sgg_id is distinct from s.id;"
    )
    print("backfill:", "OK" if ok else out[:400])


if __name__ == "__main__":
    main()
