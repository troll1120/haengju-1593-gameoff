import { audioState, previewSfx, setVolume, startBgm } from "./index";

for (const bus of ["bgm", "sfx"] as const) {
  const input = document.querySelector<HTMLInputElement>(`#volume-${bus}`);
  const output = document.querySelector<HTMLOutputElement>(`#volume-${bus}-value`);
  if (!input || !output) throw new Error(`Missing ${bus} volume control`);
  const initial = bus === "bgm" ? audioState().bgmVolume : audioState().sfxVolume;
  input.value = String(initial); output.value = `${initial}%`;
  input.addEventListener("input", () => {
    const value = Number(input.value);
    setVolume(bus, value); output.value = `${value}%`;
    if (bus === "bgm") startBgm();
  });
  if (bus === "sfx") input.addEventListener("change", previewSfx);
}
