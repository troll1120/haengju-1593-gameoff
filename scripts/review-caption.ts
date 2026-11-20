/** The review clip's name tag ("권율·Lv20"). The MP4 step lays the tag picture over every frame at this inset
 * from the top-left corner (ffmpeg overlay=8:8), so the tag must end left of the centred battle clock. */
export const CAPTION_INSET = 8;
const GAP = 6, MAX_WIDTH = 136, PAD = 6, MAX_FONT = 16, MIN_FONT = 11, BAR = 2;

export type CaptionPicture = { png: string; width: number; height: number; font: number; lines: number; room: number };

/** Browser expression painting the tag no wider than the room left of the clock's widest possible reading.
 * The text is shrunk, then wrapped at spaces and "·" onto at most three lines, never cut; it resolves to a CaptionPicture. */
export function captionPainter(caption: string): string {
  return `(async () => {
    await document.fonts.load("${MAX_FONT}px DNFBitBitv2");
    const text = ${JSON.stringify(caption)}, clock = document.getElementById("clock"), box = clock.getBoundingClientRect();
    const pen = document.createElement("canvas").getContext("2d");
    pen.font = getComputedStyle(clock).font;
    const widest = Math.max(...[..."0123456789"].map(d => pen.measureText(d + d + ":" + d + d).width));
    const room = Math.floor((box.left + box.right) / 2 - widest / 2 - ${GAP} - ${CAPTION_INSET});
    const width = Math.min(${MAX_WIDTH}, room), words = text.split(/[·\\s]+/).filter(Boolean);
    const fits = line => pen.measureText(line).width + ${2 * PAD} <= width;
    const wrap = () => words.reduce((rows, word) => {
      const joined = rows.length ? rows[rows.length - 1] + " " + word : word;
      if (rows.length && fits(joined)) rows[rows.length - 1] = joined; else rows.push(word);
      return rows;
    }, []);
    let lines, font;
    search: for (let most = 1; most <= 3; most++) for (let size = ${MAX_FONT}; size >= ${MIN_FONT}; size--) {
      pen.font = size + "px DNFBitBitv2";
      const candidate = most === 1 ? [text] : wrap();
      if (candidate.length <= most && candidate.every(fits)) { lines = candidate; font = size; break search; }
    }
    if (!lines) throw new Error("Caption " + JSON.stringify(text) + " does not fit the " + room + " px left of the clock");
    const step = font + 2, height = Math.max(28, lines.length * step + 8 + ${BAR});
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const paint = canvas.getContext("2d"); paint.fillStyle = "#262b44"; paint.fillRect(0, 0, width, height);
    paint.fillStyle = "#fdbe53"; paint.fillRect(0, height - ${BAR}, width, ${BAR});
    paint.font = font + "px DNFBitBitv2"; paint.textAlign = "center"; paint.textBaseline = "middle"; paint.fillStyle = "#ebd2ac";
    const middle = (height - ${BAR}) / 2;
    lines.forEach((line, index) => paint.fillText(line, width / 2, middle + (index - (lines.length - 1) / 2) * step));
    return { png: canvas.toDataURL("image/png").split(",")[1], width, height, font, lines: lines.length, room };
  })()`;
}
