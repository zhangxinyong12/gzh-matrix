// 素材库本机存储：data/materials/<accountId>/（素材与账号 1-1 绑定，一个号一个目录），面板缩略图与微信转存都读这里
import fs from "fs";
import path from "path";
import { Material } from "./store";

export const MATERIAL_DIR = path.join(process.cwd(), "data", "materials");

export const materialPath = (m: Pick<Material, "account_id" | "file">): string =>
  path.join(MATERIAL_DIR, String(m.account_id), m.file);

export function readMaterial(m: Pick<Material, "account_id" | "file">): Buffer {
  return fs.readFileSync(materialPath(m));
}
