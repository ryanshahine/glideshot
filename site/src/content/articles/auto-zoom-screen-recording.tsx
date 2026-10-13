import type { Article } from "../ui";

export const article: Article = {
  slug: "auto-zoom-screen-recording",
  title: "How auto-zoom in screen recordings works, and how to keep it calm",
  metaTitle: "How auto-zoom in screen recordings works",
  description:
    "Auto-zoom can make a screen recording easy to follow, or exhausting to watch. How a virtual camera decides when to zoom, and the rules that stop it from feeling frantic.",
  published: "2026-10-13",
  body: () => (
    <>
      <p>
        Auto-zoom is what turns a wide, unreadable screen recording into something people can follow on a phone. Done
        badly, it's also the quickest way to make a video exhausting to watch: zoom in, zoom out, zoom in again, every
        time the mouse twitches.
      </p>
      <p>
        The difference isn't the zoom itself. It's how the camera decides <em>when</em> to zoom, and how it moves once
        it has decided. This is how the camera in Glideshot does it, but the same ideas apply to any tool.
      </p>

      <h2>Why simple auto-zoom feels frantic</h2>
      <p>
        The simplest approach reacts to events: zoom in on a click, zoom out when the cursor moves fast. It sounds
        reasonable, but real mouse input is messy. One action often involves a click, a small correction, a scroll, a
        quick hop to a nearby button and another click. A camera that reacts to each of those pumps in and out several
        times within a few seconds.
      </p>
      <p>
        Two problems stack up: the camera reacts to individual events instead of to what the person is doing, and it
        changes its mind too quickly.
      </p>

      <h2>Decide on intent, not on events</h2>
      <p>
        A better camera looks at a short window of activity and asks what the person is doing right now. Glideshot's
        camera picks one of four modes:
      </p>
      <ul>
        <li>
          <strong>Close:</strong> someone is clicking or typing in one small area. Zoom in so the details are readable.
        </li>
        <li>
          <strong>Wide:</strong> the cursor is about to travel a long way. Zoom out so viewers can see where it's going.
        </li>
        <li>
          <strong>Base:</strong> the normal framing, at the zoom level you picked.
        </li>
        <li>
          <strong>Idle</strong> (optional): nothing has happened for a while. Pull back to show the whole context.
        </li>
      </ul>
      <p>
        In numbers: it goes close when there was a click or keystroke in the last 2.5 seconds <em>and</em> the cursor
        stayed within a small area (about 15% of the frame width). It goes wide when the cursor is about to cover more
        than three quarters of the frame width. A quick hop to a nearby button is neither, so the camera stays put.
      </p>

      <h2>Hold every decision</h2>
      <p>
        Once the camera picks a mode, it sticks with it for a minimum time: 2.5 seconds after zooming in and 1.2 seconds
        for the other modes. A short burst of clicks can't ping-pong the zoom.
      </p>
      <p>
        The conditions for leaving a mode are also looser than the ones for entering it. This is called hysteresis.
        The camera only zooms in when activity is tightly grouped, but it stays in as long as there was activity in the
        last three seconds and the cursor isn't heading somewhere far away. It's the same trick that stops a thermostat
        from switching on and off every few seconds.
      </p>

      <h2>Look ahead</h2>
      <p>
        A live camera can only react: the cursor moves, then the camera follows, always a beat late. A recording
        doesn't have that limit. Glideshot records the mouse path together with the screen, so when you edit a take,
        the camera knows where the cursor will be a moment from now. That allows two things a live camera can't do:
      </p>
      <ul>
        <li>
          Start panning slightly <em>before</em> the cursor moves, like a camera operator who knows the choreography
          (0.3 seconds ahead by default).
        </li>
        <li>Zoom out before a long move starts, instead of halfway through it.</li>
      </ul>
      <p>This is one of the best reasons to record first and frame afterwards.</p>

      <h2>Move like a camera</h2>
      <p>How the camera gets to its new framing matters as much as when it decides to go there:</p>
      <ul>
        <li>
          <strong>Springs, not fixed animations.</strong> Every camera value (position, zoom, angle) follows its target
          with a critically damped spring: it speeds up smoothly, slows down smoothly and never overshoots. If the
          target changes halfway, the motion simply bends toward the new target. A fixed-length animation would restart
          and jerk.
        </li>
        <li>
          <strong>Zoom on a log scale.</strong> Going from 1× to 2× doubles the size of everything, and so does going
          from 2× to 4×. Animating the logarithm of the zoom makes both feel equally fast. Animating the zoom value
          directly makes zooming in start slow and end abruptly.
        </li>
        <li>
          <strong>Slow zooms.</strong> A zoom change takes about three seconds to fully settle. Pans can be quicker, but
          a zoom changes the size of everything at once, so it should be gentle.
        </li>
      </ul>

      <h2>Give the cursor room</h2>
      <p>
        Most of the time, the camera shouldn't move at all. A dead zone around the center of the frame lets the cursor
        move freely inside it, and the camera only follows once the cursor leaves the zone. When the cursor stops, the
        camera glides until it's centered again. Moments of reading and pointing stay completely still, and that
        stillness is what makes the moving parts look intentional.
      </p>

      <h2>If your auto-zoom feels frantic</h2>
      <p>Check these, in this order:</p>
      <ol>
        <li>Is it reacting to single events? Make it look at the last few seconds of activity instead.</li>
        <li>Does it hold each zoom level for at least a second or two?</li>
        <li>Are the conditions for entering and leaving a zoom level different?</li>
        <li>Is the zoom animated linearly? Use a log scale and slow it down.</li>
        <li>Does the camera follow every pixel? Add a dead zone.</li>
        <li>Is the input itself frantic? Slow, deliberate mouse movement still beats any algorithm.</li>
      </ol>
      <p>
        In Glideshot, each of these behaviors has its own switch in the editor: Zoom in on clicks &amp; typing, Zoom out
        on fast moves, Pull back when idle, Dead zone and Look ahead. You can try them live on the{" "}
        <a href="/">home page</a> by opening Adjust, or read about the rest of the look in{" "}
        <a href="/blog/cinematic-screen-recordings-mac/">how to make cinematic screen recordings</a>.
      </p>
    </>
  ),
};
