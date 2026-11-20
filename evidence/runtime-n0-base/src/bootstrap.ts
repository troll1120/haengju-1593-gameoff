/** The disabled start button is already visible while modules download. */
import "./style.css";
import "./game-surface";
import "./ui-skin";
import { openIn } from "./i18n";
import { relabelDom } from "./i18n-dom";
import { startFailed, startProgress } from "./start-loading";
openIn(navigator.language);
relabelDom();
startProgress(0);
import("./main").catch(error => {
  startFailed();
  throw error;
});
