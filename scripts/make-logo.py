"""지도 헤더 로고 워드마크 PNG 생성 (Phase T 2차 1순위).

왜 이미지인가:
  안드로이드에서 Pretendard 텍스트의 측정 폭이 실제 글리프보다 좁게 잡혀
  "Tintrail"의 마지막 글자가 잘렸다(실기기). letterSpacing 제거 → flexShrink+
  paddingRight → allowFontScaling=false 로 세 번 대응했지만 실기기에서 계속
  재발했다. 이미지는 측정이 개입하지 않아 모든 기기에서 픽셀이 동일하다.

출력: assets/images/logo-wordmark.png (+ @2x, @3x)
  RN의 Image가 require() 시 화면 밀도에 맞는 파일을 자동으로 고른다.

실행: python scripts/make-logo.py
의존: Pillow (빌드타임 전용 — 앱 의존성 아님)
"""

import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT = os.path.join(ROOT, "assets", "fonts", "Pretendard-Bold.otf")
OUT_DIR = os.path.join(ROOT, "assets", "images")

TEXT = "Tintrail"
# 기존 스타일과 동일하게 맞춘다: fontSize 20, Pretendard-Bold, accent 색.
FONT_SIZE_DP = 20
COLOR = (255, 106, 43, 255)  # #ff6a2b
# 글리프가 잘리지 않도록 사방에 여유를 준다(1x 기준 dp).
PAD_DP = 2


def render(scale: int) -> Image.Image:
    font = ImageFont.truetype(FONT, FONT_SIZE_DP * scale)
    pad = PAD_DP * scale

    # 먼저 넉넉한 캔버스에 그린 뒤 실제 잉크 범위로 잘라낸다 —
    # 폰트 메트릭에 의존하지 않고 눈에 보이는 픽셀만 남기기 위함.
    probe = Image.new("RGBA", (FONT_SIZE_DP * scale * 12, FONT_SIZE_DP * scale * 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(probe)
    d.text((pad, pad), TEXT, font=font, fill=COLOR)

    bbox = probe.getbbox()
    if bbox is None:
        raise SystemExit("글자가 렌더되지 않았다 — 폰트 경로를 확인할 것")

    left, top, right, bottom = bbox
    cropped = probe.crop(
        (max(0, left - pad), max(0, top - pad), right + pad, bottom + pad)
    )
    return cropped


def main() -> None:
    base = None
    for scale in (1, 2, 3):
        img = render(scale)
        suffix = "" if scale == 1 else f"@{scale}x"
        path = os.path.join(OUT_DIR, f"logo-wordmark{suffix}.png")
        img.save(path)
        if scale == 1:
            base = img
        print(f"{os.path.basename(path)}  {img.width}x{img.height}px")

    assert base is not None
    print(f"\n1x size = {base.width}x{base.height} dp (Image style should use this)")


if __name__ == "__main__":
    main()
