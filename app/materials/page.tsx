// 素材库已并入账号管理（素材与账号 1-1 绑定，2026-09-18 改版）：旧链接统一跳回账号管理
import { redirect } from "next/navigation";

export default function Materials() {
  redirect("/accounts");
}
