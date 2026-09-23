"use client";
import { useState } from "react";

type Mode = "login" | "apply";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setErr("");
    setOkMsg("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setOkMsg("");
    if (mode === "login") {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      setBusy(false);
      if (r.ok) {
        // 整页跳转，避免客户端路由缓存导致不跳转
        window.location.href = "/";
      } else {
        const d = await r.json();
        setErr(d.error || "登录失败");
      }
    } else {
      const r = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, note }),
      });
      setBusy(false);
      const d = await r.json();
      if (r.ok) {
        setOkMsg(d.msg || "申请已提交");
        setUsername("");
        setPassword("");
        setNote("");
      } else {
        setErr(d.error || "提交失败");
      }
    }
  };

  const inputCls =
    "w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06] focus:shadow-[0_0_24px_rgba(34,211,238,0.15)]";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white font-sans">
      {/* ===== 背景层 ===== */}
      <div className="absolute inset-0 matrix-grid" />
      <div className="absolute -top-40 -left-40 w-[560px] h-[560px] rounded-full bg-cyan-500/10 blur-[140px] glow-drift" />
      <div className="absolute -bottom-52 -right-32 w-[620px] h-[620px] rounded-full bg-violet-600/10 blur-[160px] glow-drift-2" />
      <div className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full border border-cyan-400/10 rounded-full ring-pulse" />
      {/* 浮动粒子 */}
      {[
        { l: "12%", t: "22%", d: "0s", s: 3 },
        { l: "28%", t: "68%", d: "1.2s", s: 2 },
        { l: "55%", t: "15%", d: "2.1s", s: 2 },
        { l: "72%", t: "58%", d: "0.6s", s: 3 },
        { l: "86%", t: "30%", d: "1.7s", s: 2 },
        { l: "40%", t: "82%", d: "2.6s", s: 2 },
      ].map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-cyan-300/50 particle"
          style={{ left: p.l, top: p.t, width: p.s + 1, height: p.s + 1, animationDelay: p.d }}
        />
      ))}

      {/* ===== 顶部状态栏 ===== */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 text-xs text-white/40">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>SYSTEM ONLINE</span>
        </div>
        <div className="tracking-[0.3em]">GZH-MATRIX · v1.0</div>
      </header>

      {/* ===== 主体 ===== */}
      <main className="relative z-10 grid lg:grid-cols-2 gap-12 px-8 lg:px-20 items-center min-h-[calc(100vh-120px)]">
        {/* 左：品牌区 */}
        <section className="hidden lg:block">
          <div className="inline-flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center font-black text-[#050816] shadow-[0_0_30px_rgba(34,211,238,0.4)]">
              G
            </div>
            <span className="font-bold tracking-widest text-white/80">GZH-MATRIX</span>
          </div>
          <h1 className="text-5xl xl:text-6xl font-black leading-[1.15] mb-6">
            公众号矩阵
            <br />
            <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent">
              智能写文中枢
            </span>
          </h1>
          <p className="text-white/40 text-sm leading-relaxed mb-10 max-w-md">
            热点实时追踪 · 多账号错峰推送 · AI 成稿 · 人工终审发布。
            <br />
            一个控制台，管理整个内容矩阵。
          </p>
          <ul className="space-y-4 text-sm">
            {[
              ["热点雷达", "联网检索截流圈最新规则与玩法，时效以小时计"],
              ["错峰队列", "多号自动间隔推送，接口零挤压"],
              ["人审终关", "AI 只出草稿，发布权永远在你手里"],
            ].map(([t, d]) => (
              <li key={t} className="flex items-start gap-4">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                <div>
                  <span className="text-white/85 font-semibold">{t}</span>
                  <span className="text-white/35 ml-3">{d}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 右：登录卡片 */}
        <section className="flex justify-center lg:justify-end">
          <div className="w-full max-w-md relative">
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-cyan-400/40 via-transparent to-violet-500/40 blur-[2px]" />
            <form
              onSubmit={submit}
              className="relative bg-[#0a1128]/80 backdrop-blur-xl rounded-2xl p-10 space-y-6 border border-white/[0.06]"
            >
              <div className="space-y-1">
                <div className="text-xs tracking-[0.35em] text-cyan-300/70 mb-2">ACCESS CONSOLE</div>
                <h2 className="text-2xl font-bold">{mode === "login" ? "用户登录" : "申请注册"}</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-white/40 mb-2">用户名</label>
                  <input
                    autoFocus
                    className={inputCls}
                    placeholder={mode === "login" ? "输入用户名（管理员 admin）" : "自拟用户名（字母/数字/下划线）"}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-2">密码</label>
                  <input
                    type="password"
                    className={inputCls}
                    placeholder={mode === "apply" ? "自拟密码（至少 6 位）" : "••••••••"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {mode === "apply" && (
                  <div>
                    <label className="block text-xs text-white/40 mb-2">备注（选填）</label>
                    <input
                      className={inputCls}
                      placeholder="做什么号的、从哪里了解到，帮管理员快速通过"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {err && (
                <div className="text-sm text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2">
                  {err}
                </div>
              )}
              {okMsg && (
                <div className="text-sm text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2 leading-relaxed">
                  {okMsg}
                </div>
              )}
              <button
                type="submit"
                disabled={busy || !username || !password}
                className="relative w-full py-3.5 rounded-xl font-semibold text-sm text-[#050816] bg-gradient-to-r from-cyan-400 to-sky-400 hover:from-cyan-300 hover:to-sky-300 transition shadow-[0_0_30px_rgba(34,211,238,0.25)] disabled:opacity-30 disabled:shadow-none overflow-hidden group"
              >
                <span className="relative z-10">
                  {busy ? "处理中…" : mode === "login" ? "接入系统" : "提交申请"}
                </span>
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              </button>
              {mode === "apply" && (
                <p className="text-center text-xs text-amber-300/80 bg-amber-400/[0.06] border border-amber-400/15 rounded-lg px-3 py-2">
                  提交后请联系 <span className="font-bold text-amber-300">wo812570284</span> 审核开通
                </p>
              )}
              <p className="text-center text-[11px] text-white/25">
                {mode === "login" ? (
                  <>
                    没有账号？{" "}
                    <button type="button" onClick={() => switchMode("apply")} className="text-cyan-300/80 hover:text-cyan-300 underline underline-offset-2">
                      申请注册
                    </button>
                    {" · "}以人审方式发布内容 · Cookie 30 天
                  </>
                ) : (
                  <>
                    已有账号？{" "}
                    <button type="button" onClick={() => switchMode("login")} className="text-cyan-300/80 hover:text-cyan-300 underline underline-offset-2">
                      返回登录
                    </button>
                  </>
                )}
              </p>
            </form>
          </div>
        </section>
      </main>

      {/* 底部 */}
      <footer className="relative z-10 px-8 pb-6 text-[11px] text-white/20 flex justify-between">
        <span>self-hosted · :8100</span>
        <span>公众号矩阵 · 内容工作台</span>
      </footer>
    </div>
  );
}
