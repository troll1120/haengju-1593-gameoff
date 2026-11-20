import "./game-surface.css";

const root = document.querySelector("#app");
if (root) {
  const fields = "input, textarea, select";
  for (const type of ["dragstart", "selectstart", "contextmenu"]) {
    root.addEventListener(type, event => {
      const target = event.target instanceof Element ? event.target
        : event.target instanceof Node ? event.target.parentElement : null;
      const editable = target?.closest("[contenteditable]");
      const editableValue = editable?.getAttribute("contenteditable")?.toLowerCase();
      if (target?.closest(fields) || editableValue === "" || editableValue === "true"
        || editableValue === "plaintext-only") return;
      event.preventDefault();
    }, { capture: true });
  }
  const protectMedia = (node: Element) => {
    if (node.matches("img, canvas, svg")) node.setAttribute("draggable", "false");
    for (const media of Array.from(node.querySelectorAll("img, canvas, svg"))) media.setAttribute("draggable", "false");
  };
  protectMedia(root);
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Element) protectMedia(node);
      }
    }
  }).observe(root, { childList: true, subtree: true });
}
