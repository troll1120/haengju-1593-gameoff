/** Account migration notice, independent of combat banners and panel lifetimes. */
export function showBphRefundToast(message: string): void {
  const toast = document.createElement("div");
  toast.setAttribute("role", "status");
  toast.dataset.refundToast = "";
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed", left: "50%", bottom: "calc(20px + env(safe-area-inset-bottom))",
    transform: "translateX(-50%)", zIndex: "10000", width: "max-content",
    maxWidth: "calc(100vw - 32px)", padding: "10px 14px", borderRadius: "8px",
    background: "#231d18", color: "#fff3d3", border: "1px solid #a98b59",
    font: "13px/1.5 sans-serif", textAlign: "center", pointerEvents: "none",
  });
  document.body.append(toast);
  setTimeout(() => toast.remove(), 6500);
}
