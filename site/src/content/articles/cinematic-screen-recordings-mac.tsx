import { Kbd, type Article } from "../ui";

export const article: Article = {
  slug: "cinematic-screen-recordings-mac",
  title: "How to make cinematic screen recordings on a Mac",
  description:
    "Why most screen recordings look flat, and the camera ideas that fix it: a camera that follows the action, a 3D angle, shallow focus, deliberate zooms and motion blur.",
  published: "2026-10-13",
  body: () => (
    <>
      <p>
        Most screen recordings look like a screenshot that happens to move. Every pixel is equally sharp, the frame
        never changes, and the only thing in motion is a small cursor somewhere in a sea of interface. Viewers have to
        find the action themselves.
      </p>
      <p>
        Film looks different because it's shot with a camera. A camera stands somewhere, so there's an angle. It has a
        lens, so only part of the picture is in focus. It moves to follow the action, and its shutter stays open long
        enough to smear fast movement. You can bring all of that to a screen recording. Here's how each part works and
        which settings hold up in practice.
      </p>

      <h2>1. Let a camera follow the action</h2>
      <p>
        The biggest upgrade is a camera that frames what matters. Instead of showing the whole display, zoom in (2 to
        2.5× is a good start for a laptop or 1440p screen) and let the frame follow the cursor.
      </p>
      <p>A camera that follows every pixel of mouse movement feels nervous, though. Two things calm it down:</p>
      <ul>
        <li>
          <strong>A dead zone.</strong> Small movements inside a circle around the center don't move the camera at
          all. Only when the cursor leaves that circle does the camera glide after it, and when the cursor stops, the
          camera settles until the cursor is centered again.
        </li>
        <li>
          <strong>Smoothing.</strong> The camera chases its target with a spring instead of jumping to it. A little
          smoothing (around 20%) looks like a steady hand; a lot looks floaty.
        </li>
      </ul>
      <p>
        Sometimes you don't want a moving camera at all. For a tour of a single dialog, lock the camera on one spot and
        let the cursor move inside the frame.
      </p>

      <h2>2. Tilt the screen</h2>
      <p>
        A flat rectangle reads as "screenshot". Turning the screen in 3D (leaning it back, turning it a little to the
        side, rotating it slightly) makes it read as an object in space. Three angles control it:
      </p>
      <ul>
        <li>
          <strong>Pitch</strong> leans the top of the screen away from you. 15 to 25° is plenty.
        </li>
        <li>
          <strong>Yaw</strong> turns one side away. 10 to 20° adds depth without making text hard to read.
        </li>
        <li>
          <strong>Roll</strong> rotates the frame. A few degrees breaks the rigid horizontal; much more starts to look
          like a gimmick.
        </li>
      </ul>
      <p>
        A <strong>perspective</strong> setting decides how strongly near parts grow and far parts shrink, like the
        difference between a wide-angle and a telephoto lens. Moderate values look the most natural. The rule of thumb:
        tilt until it looks deliberate, then back off a little. The viewer still needs to read the interface.
      </p>

      <h2>3. Use shallow focus</h2>
      <p>
        Depth of field is a big part of what makes film look like film: only a slice of the scene is sharp, and
        everything nearer or further falls off into blur. In a screen recording it does a useful job. It tells the
        viewer where to look.
      </p>
      <p>Two kinds of blur work together:</p>
      <ul>
        <li>
          <strong>Focus around the action.</strong> A sharp area follows the cursor, and the picture gets softer the
          further you get from it.
        </li>
        <li>
          <strong>Blur from the tilt.</strong> The parts of the screen that lean away from the lens are further away, so
          they get blurrier, just like with a real camera.
        </li>
      </ul>
      <p>
        Keep it subtle. At 1080p, a maximum blur of around 15 to 20 pixels separates the focus from the background
        without turning the rest of the screen into soup. Make the sharp area big enough that a full line of text or a
        group of buttons stays crisp.
      </p>

      <h2>4. Zoom with intent</h2>
      <p>
        Zooming in when something happens is a great way to guide attention, and the easiest way to make viewers
        seasick. Good auto-zoom follows three rules:
      </p>
      <ul>
        <li>Zoom in when someone clicks or types in one area, not on every single click.</li>
        <li>Zoom out before a long move across the screen, so viewers see where the cursor is going.</li>
        <li>Hold each zoom level for a couple of seconds. Changing every half second is what makes recordings feel frantic.</li>
      </ul>
      <p>
        There's a deeper dive in <a href="/blog/auto-zoom-screen-recording/">how auto-zoom works</a>.
      </p>

      <h2>5. Add motion blur</h2>
      <p>
        Film cameras traditionally expose each frame for half the frame time (the "180° shutter"), so anything that
        moves during that time is slightly smeared. Without that smear, fast pans and cursor flicks look like a series
        of sharp stills and feel stuttery, even at 60 fps. With it, they look like motion.
      </p>
      <p>
        In a screen recording, motion blur can be computed from how the camera and cursor move between frames. A still
        frame stays perfectly sharp; the blur only shows up when something moves.
      </p>

      <h2>6. Treat the cursor as an actor</h2>
      <p>
        The cursor is usually the main character, and the system cursor is tiny. Draw it larger (1.5 to 2×), smooth its
        path so jitter from your hand doesn't show, and add a small ripple on clicks so viewers see that something
        happened. If you pause to explain something, let it fade out when it's idle.
      </p>

      <h2>7. Record first, frame later</h2>
      <p>
        All of these settings interact, and you won't get them right while you're also giving the demo. It's much
        easier to record the plain screen plus the mouse and keyboard activity, then decide on the camera afterwards.
        That way you can try another angle, change the zoom or turn off depth of field without recording again, and
        export the same take as 16:9 for YouTube and 9:16 for Shorts (see{" "}
        <a href="/blog/screen-recording-export-settings/">export settings for each platform</a>).
      </p>

      <h2>Doing it with Glideshot</h2>
      <p>
        Glideshot is a free, open-source Mac app built around this workflow. You record the raw screen, and a virtual
        camera does the rest:
      </p>
      <ol>
        <li>
          <a href="/install/">Install Glideshot</a> and allow Screen Recording.
        </li>
        <li>
          Pick a look (Cinematic is a good start), then press <Kbd>⌃⌥⌘R</Kbd> to start recording and again to stop.
        </li>
        <li>In the editor, adjust the angle, zoom, focus and camera behavior while the take plays, then export.</li>
      </ol>
      <p>
        Everything above (dead zone, look ahead, auto-zoom, depth of field, motion blur, cursor smoothing, click
        ripples) has its own switch, so you can use as much or as little of it as you like. You can try the camera
        right in your browser on the <a href="/">home page</a>.
      </p>

      <h2>A checklist before you hit record</h2>
      <ul>
        <li>Turn on Do Not Disturb so notifications don't pop up mid-take.</li>
        <li>Close unrelated windows and tabs, and tidy the desktop.</li>
        <li>
          Increase the text size in the app you're demoing. The camera can zoom, but large, crisp text always reads
          better.
        </li>
        <li>Move the mouse slower than you think you need to. Calm input makes a calm camera.</li>
        <li>Pause for a second before and after each action. It gives the camera time to settle and you clean places to cut.</li>
      </ul>
    </>
  ),
};
