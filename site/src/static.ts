// The only script on the static pages (blog, install guide): fresh GitHub numbers and Copy buttons. No React.
// (Styles are a <link> in the page head, see scripts/prerender.mjs.)
import { cachedRepoStats, fillGitHubButtons, loadRepoStats } from "./site/github";

const cached = cachedRepoStats(); // newer than the build, until GitHub answers
if (cached) fillGitHubButtons(cached);
loadRepoStats().then((stats) => stats && fillGitHubButtons(stats));

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy!);
      button.textContent = "Copied";
    } catch {
      // Clipboard blocked: select the command so it can be copied by hand.
      const code = button.parentElement?.querySelector("code");
      if (code) getSelection()?.selectAllChildren(code);
      button.textContent = "Select";
    }
    setTimeout(() => (button.textContent = "Copy"), 1600);
  });
}
