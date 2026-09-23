// 剪贴板工具：面板线上是 HTTP（无安全上下文，navigator.clipboard 为 undefined），
// 必须走 隐藏节点 + document.execCommand('copy') 兜底。execCommand 有三条铁律
// （违反任何一条都是「返回 true 但剪贴板没写入」的假成功，真机 http + Ctrl+V 回读实锤）：
// ① 节点必须留在视口内（position:fixed 原位 + 1px + opacity:0）；移出视口（left:-9999px）Chrome 151 假成功
// ② antd Modal 开着时节点挂 body 会被 rc-dialog 焦点陷阱抢走焦点（select 清零）→ 挂载点优先放进当前打开的弹窗容器内
// ③ execCommand 返回值在 React 合成事件路径下不可信（恒 false 但内容已写入）→ 挂一次性 copy 监听
//    强制 setData + preventDefault，成功判据 =「copy 事件触发过 || 返回值为 true」

// 隐藏挂载点宿主：当前焦点所在弹窗 > 最后一个打开中的弹窗 > body（铁律②）
function mountHost(): HTMLElement {
  const openModals = Array.from(document.querySelectorAll<HTMLElement>(".ant-modal")).filter(
    (m) => m.getClientRects().length > 0,
  );
  const inModal = (document.activeElement as HTMLElement | null)?.closest?.(".ant-modal");
  return (inModal as HTMLElement) || openModals[openModals.length - 1] || document.body;
}

/** 纯文本复制，返回是否真正写入剪贴板 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // HTTP 或权限被拒，落到 execCommand 兜底
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.readOnly = true;
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.width = "1px";
  ta.style.height = "1px";
  ta.style.opacity = "0";
  mountHost().appendChild(ta);
  let eventWritten = false;
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData("text/plain", text);
    e.preventDefault();
    eventWritten = true;
  };
  ta.addEventListener("copy", onCopy);
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand("copy") || eventWritten;
  } catch {
    return eventWritten;
  } finally {
    ta.removeEventListener("copy", onCopy);
    ta.remove();
  }
}

/** 富文本复制（text/html + text/plain 双格式），公众号后台正文区直接 Ctrl+V 保留排版 */
export async function copyRichToClipboard(html: string): Promise<boolean> {
  const plain = html.replace(/<[^>]+>/g, "");
  if (window.isSecureContext && navigator.clipboard && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      // 落到下面的 execCommand 降级
    }
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.overflow = "hidden";
  container.style.opacity = "0";
  mountHost().appendChild(container);
  let eventWritten = false;
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData("text/html", html);
    e.clipboardData?.setData("text/plain", plain);
    e.preventDefault();
    eventWritten = true;
  };
  document.addEventListener("copy", onCopy);
  try {
    const range = document.createRange();
    range.selectNodeContents(container);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand("copy") || eventWritten;
    sel?.removeAllRanges();
    return ok;
  } catch {
    return eventWritten;
  } finally {
    document.removeEventListener("copy", onCopy);
    container.remove();
  }
}
