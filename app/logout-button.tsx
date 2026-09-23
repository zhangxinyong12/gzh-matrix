"use client";

export default function LogoutButton() {
  return (
    <button
      onClick={async () => {
        await fetch("/api/logout", { method: "POST" });
        location.href = "/login";
      }}
      className="text-xs text-gray-400 hover:text-white transition"
    >
      退出
    </button>
  );
}
