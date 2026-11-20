import { expect, test } from "bun:test";

test.each(["bph-enemy-effects", "bph-fx-dispatch", "bph-combat",
  "bph-effects-entry", "bph-quests", "bph-session"])(
  "the shared registry initializes when %s is the first imported module",
  async module => {
    const url = new URL(`./${module}.ts`, import.meta.url).href;
    const child = Bun.spawn([process.execPath, "-e", `await import(${JSON.stringify(url)}); console.log("ok");`], {
      env: process.env, stdout: "pipe", stderr: "pipe",
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ]);
    expect({ exit, stdout, stderr }).toEqual({ exit: 0, stdout: "ok\n", stderr: "" });
  },
);
