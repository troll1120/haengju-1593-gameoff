import { launch } from "./review-browser";

const [folder] = Bun.argv.slice(2);
const page = await launch("about:blank", `${folder}/comparison-browser`, 1170, 1400,
  ["--single-process", "--no-zygote", "--disable-gpu"]);
try {
  await page.view.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1170, height: 1400, deviceScaleFactor: 1, mobile: false,
  });
  const pictures = [];
  const switches: Record<string, number> = {};
  for (const label of ["before", "after"]) {
    const data = await Bun.file(`${folder}/${label}-motion.json`).json();
    switches[label] = data.rows.slice(1).filter((row: { units: { quarry?: number }[] }, i: number) =>
      data.rows[i].units[0].quarry !== undefined && data.rows[i].units[0].quarry !== row.units[0].quarry).length;
  }
  for (const label of ["before", "after"]) for (const frame of ["02", "04", "06"]) {
    const data = Buffer.from(await Bun.file(`${folder}/frames/${label}-motion-${frame}.png`).arrayBuffer()).toString("base64");
    pictures.push({ label, frame, data });
  }
  await page.evaluate(`(()=>{document.body.innerHTML=${JSON.stringify(`
    <style>
      *{box-sizing:border-box}body{margin:0;background:#161c20;color:#fff;font-family:Arial,sans-serif;padding:20px}
      h1{font-size:26px;margin:0 0 8px}p{font-size:17px;margin:0 0 12px}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
      figure{margin:0}figcaption{font-size:20px;padding:8px;background:#303b41}
      img{display:block;width:100%;height:530px;object-fit:cover;object-position:top}
      footer{font-size:17px;padding-top:14px;line-height:1.5}
    </style>
    <h1>병사 타깃 유지 · 같은 조건의 실제 브라우저 화면</h1>
    <p>390×844 화면의 전투 영역 · 움직이는 적 둘의 거리 차이 6px · 최초 선택 제외</p>
    <div class="grid">${pictures.map(({ label, frame, data }) => `
      <figure><figcaption>${label === "before" ? "수정 전" : "수정 후"} · ${Number(frame) / 4}초</figcaption>
      <img src="data:image/png;base64,${data}"></figure>`).join("")}</div>
    <footer>수정 전: 4초 동안 타깃 ${switches.before}회 전환 / 수정 후: 전환 ${switches.after}회<br>
    적 위치를 병사 기준으로 교대시킨 통제 재현입니다. 자연 전투 승패는 별도 동일 시드로 비교했습니다.</footer>
  `)};return true})()`);
  await page.evaluate("Promise.all([...document.images].map(img=>img.decode()))");
  await page.shot(`${folder}/comparison.png`);
} finally {
  page.view.close();
}
