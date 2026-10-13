import { Tip, type Article } from "../ui";

export const article: Article = {
  slug: "screen-recording-export-settings",
  title: "Screen recording export settings for YouTube, X, LinkedIn and Instagram",
  metaTitle: "Screen recording export settings for every platform",
  description:
    "Which aspect ratio, resolution, frame rate and codec to use for screen recordings on YouTube, Shorts, X, LinkedIn and Instagram, and how to export one take in several formats.",
  published: "2026-10-13",
  body: () => (
    <>
      <p>
        A screen recording that looks great on your display can end up as a blurry, letterboxed postage stamp once it's
        uploaded. Most of that comes down to four settings: aspect ratio, resolution, frame rate and codec. Here's what
        to pick for the common platforms, and why.
      </p>

      <h2>Quick answer</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Where</th>
              <th>Aspect ratio</th>
              <th>Size</th>
              <th>Frame rate</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>YouTube</td>
              <td>16:9</td>
              <td>2560×1440 or 3840×2160</td>
              <td>60 fps</td>
            </tr>
            <tr>
              <td>Shorts, Reels, TikTok</td>
              <td>9:16</td>
              <td>1080×1920</td>
              <td>60 fps</td>
            </tr>
            <tr>
              <td>X</td>
              <td>16:9 or 1:1</td>
              <td>1920×1080 or 1080×1080</td>
              <td>60 fps</td>
            </tr>
            <tr>
              <td>LinkedIn</td>
              <td>1:1 or 4:5</td>
              <td>1080×1080 or 1080×1350</td>
              <td>30 or 60 fps</td>
            </tr>
            <tr>
              <td>Instagram feed</td>
              <td>4:5</td>
              <td>1080×1350</td>
              <td>30 or 60 fps</td>
            </tr>
            <tr>
              <td>Docs and product pages</td>
              <td>16:10</td>
              <td>1728×1080</td>
              <td>30 fps</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Use H.264 in an MP4 file unless you have a reason not to. The details are below.</p>
      <Tip>
        Platforms change their upload limits (maximum length, file size, resolution) regularly. This guide is about what
        looks good. Check each platform's help pages for the current hard limits.
      </Tip>

      <h2>Aspect ratio: shape the frame for where it's watched</h2>
      <p>
        The aspect ratio matters most, because the platform will letterbox or crop anything that doesn't fit its
        player.
      </p>
      <ul>
        <li>
          <strong>16:9</strong> fills YouTube's player, embedded players on websites and presentations.
        </li>
        <li>
          <strong>1:1 and 4:5</strong> work well in social feeds. Most people scroll on their phones, and a square or
          slightly tall video takes up more of the feed than a wide one.
        </li>
        <li>
          <strong>9:16</strong> is full-screen vertical video: Shorts, Reels, TikTok and Stories.
        </li>
        <li>
          <strong>16:10 and 4:3</strong> match the shape of a Mac screen or a centered layout, which suits documentation
          and product pages.
        </li>
      </ul>
      <p>
        Screens are landscape, so vertical formats need a camera that zooms in and follows the action. Otherwise you're
        showing a tiny strip of the screen. A following camera can frame the same take as 16:9 and as 9:16, deciding
        what to show in each.
      </p>

      <h2>Resolution: 1080p is the baseline</h2>
      <ul>
        <li>
          <strong>1080p</strong> (1920×1080 for 16:9, 1080×1920 for 9:16) is a safe default everywhere.
        </li>
        <li>
          <strong>1440p or 4K</strong> is worth it for YouTube. YouTube tends to give higher-resolution uploads more
          bitrate, which keeps small interface text sharper, even for people watching at 1080p.
        </li>
        <li>For social feeds, uploading above 1080p rarely helps, because the video is usually re-encoded for phones.</li>
      </ul>
      <p>
        Whatever size you export, record at your display's native resolution. Zooming into a Retina recording keeps
        text sharp; zooming into a low-resolution recording makes it soft.
      </p>

      <h2>Frame rate: 60 fps for cursor movement</h2>
      <p>
        Screen recordings are mostly still, but when things move (a cursor flick, a scroll, a camera pan) 30 fps can
        look choppy. 60 fps keeps motion smooth. Some platforms convert uploads to 30 fps, which is fine, especially if
        the recording has motion blur, which makes movement read smoothly even at lower frame rates. Use 30 fps when file
        size matters more, for example in documentation.
      </p>

      <h2>Codec: H.264 unless you have a reason</h2>
      <ul>
        <li>
          <strong>H.264</strong> plays everywhere, and every platform accepts it.
        </li>
        <li>
          <strong>HEVC (H.265)</strong> gives similar quality in a smaller file. It's great for keeping archives and for
          sharing between Apple devices, but some web players and older software can't play it.
        </li>
      </ul>
      <p>
        Platforms re-encode everything you upload, so a higher-quality upload simply means less damage after their
        compression. Don't squeeze the file before uploading.
      </p>

      <h2>Make it readable on a phone</h2>
      <p>
        The most common problem isn't a setting. It's text that's too small: a full 1440p Mac screen shrunk to a phone
        is unreadable. Zoom in (2× or more), increase the text size in the app before recording, and keep the action
        near the middle of the frame. Most feeds autoplay muted, so make sure the video makes sense without sound.
      </p>

      <h2>One take, every format</h2>
      <p>
        If you post the same demo in several places, record once and export several times. In Glideshot, pick a main
        format and tick extra ones under "Also export as…". It renders 16:9, 16:10, 4:3, 1:1, 4:5 and 9:16 versions from
        the same take, with the camera framing each shape on its own. Exports can be 1080p, 1440p or 4K, at 30 or 60 fps,
        in H.264 or HEVC.
      </p>
      <p>
        For the look itself (angle, focus, zoom), see{" "}
        <a href="/blog/cinematic-screen-recordings-mac/">how to make cinematic screen recordings on a Mac</a>.
      </p>
    </>
  ),
};
