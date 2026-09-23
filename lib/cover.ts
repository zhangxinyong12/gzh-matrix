// 封面生成：900×383 深色底 + 红色装饰线 + 白字标题 + daydayago 署名（与主号样板一致）
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import fs from "fs";

const FONT_CANDIDATES = [
  "C:\\Windows\\Fonts\\msyhbd.ttc",
  "C:\\Windows\\Fonts\\msyh.ttc",
  "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
];

function loadFont(size: number): ReturnType<typeof GlobalFonts.register> | null {
  void size;
  return null;
}

function registerFonts(): boolean {
  for (const p of FONT_CANDIDATES) {
    if (fs.existsSync(p)) {
      GlobalFonts.registerFromPath(p, "MSYH");
      return true;
    }
  }
  return false;
}

export function generateCover(title: string, subtitle: string, sign: string): Buffer {
  const W = 900, H = 383;
  const hasFont = registerFonts();
  const canvas = createCanvas(W, H);
  const d = canvas.getContext("2d");

  d.fillStyle = "#1a1a2e";
  d.fillRect(0, 0, W, H);
  d.fillStyle = "#e94560";
  d.fillRect(60, 60, 780, 5);

  const fam = hasFont ? "MSYH" : "sans-serif";
  d.fillStyle = "#ffffff";
  d.font = `bold 56px ${fam}`;
  d.textAlign = "center";
  d.fillText(title.slice(0, 14), W / 2, 170);
  d.fillStyle = "#f0f0f0";
  d.font = `38px ${fam}`;
  d.fillText(subtitle.slice(0, 18), W / 2, 245);

  d.textAlign = "right";
  d.fillStyle = "#8888aa";
  d.font = `24px ${fam}`;
  d.fillText(sign, W - 40, H - 36);

  return canvas.toBuffer("image/png");
}
