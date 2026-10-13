import { SITE } from "../../site/config";
import type { Article } from "../ui";

export const article: Article = {
  slug: "screen-studio-alternative",
  title: "A free, open-source alternative to Screen Studio",
  metaTitle: "Free, open-source Screen Studio alternative for Mac",
  description:
    "Glideshot is a free, open-source Mac screen recorder with auto-zoom, a smooth cursor, a 3D camera angle and depth of field. How it compares to Screen Studio, and when Screen Studio is the better pick.",
  published: "2026-10-13",
  body: () => (
    <>
      <p>
        Screen Studio made polished screen recordings mainstream on the Mac: record your screen, and the app adds
        smooth zooms and a nicer cursor without a video editor. It's a well-made commercial app, and for many people
        it's the right choice.
      </p>
      <p>
        If you want something free, open source, or with a different look, Glideshot might be a better fit. This is an
        honest comparison. Both apps change over time, so check Screen Studio's own website for its current features
        and pricing.
      </p>

      <h2>What they have in common</h2>
      <ul>
        <li>Both are native Mac apps that record your screen and make it look produced, automatically.</li>
        <li>A camera that zooms in on clicks and typing and follows your cursor.</li>
        <li>A larger, smoothed cursor and click effects.</li>
        <li>You can change the look after recording, and export in several aspect ratios.</li>
      </ul>

      <h2>What Glideshot does differently</h2>
      <h3>It films your screen with a 3D camera</h3>
      <p>
        Glideshot treats your screen like a physical object in front of a camera. The screen is tilted in 3D (pitch, yaw
        and roll, with adjustable perspective), and the camera has a real depth of field: the area around the action
        stays sharp, while the rest of the screen, especially the parts leaning away from the lens, falls into blur. The
        result looks more like a product film than a zoomed-in screenshot. You can see it live on the{" "}
        <a href="/">home page</a>.
      </p>
      <h3>It's free and open source</h3>
      <p>
        Glideshot costs nothing, and the source code is on <a href={SITE.repoUrl}>GitHub</a>. You can read exactly what
        it does, build it yourself and change it. It doesn't connect to the internet, and there's no account and no
        analytics.
      </p>
      <h3>Every behavior is a switch</h3>
      <p>
        Dead zone, look ahead, zoom on clicks and typing, zoom out on fast moves, pull back when idle, handheld drift,
        intro and outro, depth of field, focus following the cursor, motion blur, cursor smoothing, click ripples,
        hiding the idle cursor and the vignette can each be turned off on their own. If all you want is a flat, steady
        recording with a nicer cursor, you can have that too.
      </p>
      <h3>The camera knows what happens next</h3>
      <p>
        Because Glideshot keeps the raw recording plus the mouse and keyboard activity, its camera can look ahead: it
        starts moving just before the cursor does and zooms out before a long move instead of during it. There's more
        about this in <a href="/blog/auto-zoom-screen-recording/">how auto-zoom works</a>.
      </p>

      <h2>When Screen Studio is the better pick</h2>
      <ul>
        <li>
          <strong>Narration and webcam.</strong> Glideshot doesn't record audio yet and has no webcam overlay. If you
          talk over your demos or want your face in the corner, Screen Studio can record your microphone and camera
          today.
        </li>
        <li>
          <strong>A full editor.</strong> Glideshot's editor is for styling a take, not for cutting it: there's no
          trimming, no text overlays and no hand-edited zoom timeline. For that, export from Glideshot and finish in a
          video editor.
        </li>
        <li>
          <strong>Maturity and support.</strong> Screen Studio is a commercial product with a team behind it. Glideshot
          is a young open-source project.
        </li>
        <li>
          <strong>Older Macs.</strong> Glideshot needs a Mac with Apple silicon and macOS 14 Sonoma or later.
        </li>
      </ul>

      <h2>Which one should you use?</h2>
      <p>
        Pick Screen Studio if you need narration, a webcam or an all-in-one editor, and you're happy to pay for it. Pick
        Glideshot if you want a free and open-source tool, like the tilted, shallow-focus look, or want precise control
        over how the camera behaves.
      </p>
      <p>
        Since Glideshot is free, the easiest way to decide is to try the camera <a href="/">in your browser</a>, then{" "}
        <a href="/install/">install the app</a> and record something real.
      </p>
    </>
  ),
};
