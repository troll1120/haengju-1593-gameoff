import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { launch } from "./review-browser";

const [before, after, output] = Bun.argv.slice(2);
const profile = await mkdtemp(`${tmpdir()}/turtle-comparison-`);
const page = await launch("about:blank", profile, 780, 884);
try {
  const images = await Promise.all([before, after].map(async path =>
    `data:image/png;base64,${Buffer.from(await Bun.file(path).arrayBuffer()).toString("base64")}`));
  const data = await page.evaluate(`(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 780; canvas.height = 884;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#161b23"; ctx.fillRect(0, 0, 780, 884);
    ctx.font = "bold 20px sans-serif"; ctx.fillStyle = "white"; ctx.textAlign = "center";
    ctx.fillText("수정 전", 195, 27); ctx.fillText("수정 후", 585, 27);
    for (const [index, src] of ${JSON.stringify(images)}.entries()) {
      const image = new Image(); image.src = src; await image.decode();
      if (image.width !== 390 || image.height !== 844) throw new Error("Expected 390x844 frame");
      ctx.drawImage(image, index * 390, 40);
    }
    return canvas.toDataURL("image/png").split(",")[1];
  })()`);
  if (typeof data !== "string") throw new Error("Missing comparison image");
  await Bun.write(output, Buffer.from(data, "base64"));
  console.log(`TURTLE_COMPARISON_OK ${output} 780x884`);
} finally {
  page.view.close();
  await rm(profile, { recursive: true, force: true });
}
