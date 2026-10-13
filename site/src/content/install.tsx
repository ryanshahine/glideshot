// The install guide (/install/). Glideshot isn't notarized, so this page has to make the first launch easy.
import type { ReactNode } from "react";
import { DownloadButton } from "../site/chrome";
import { SITE } from "../site/config";
import { Command, Kbd, Tip } from "./ui";

export const INSTALL = {
  path: "/install/",
  title: "How to install Glideshot",
  metaTitle: "Install Glideshot on your Mac",
  description:
    "Download Glideshot and open it on macOS Sequoia, Tahoe and later, even though it isn't notarized, then allow Screen Recording. It takes about a minute.",
  published: "2026-10-13",
};

/** The steps, also used for the HowTo structured data. */
export const INSTALL_STEPS: { name: string; body: ReactNode }[] = [
  {
    name: "Download Glideshot",
    body: (
      <>
        <p>
          Your browser saves <strong>Glideshot.zip</strong>. Double-click it to unzip it if your browser didn't already.
        </p>
        <div className="not-article mt-4">
          <DownloadButton />
        </div>
      </>
    ),
  },
  {
    name: "Move it to Applications",
    body: (
      <p>
        Drag <strong>Glideshot</strong> into the <strong>Applications</strong> folder in Finder.
      </p>
    ),
  },
  {
    name: "Open it once",
    body: (
      <p>
        Double-click Glideshot. macOS shows <em>“Glideshot” Not Opened</em> because Apple hasn't checked the app. Click{" "}
        <strong>Done</strong>, not Move to Trash.
      </p>
    ),
  },
  {
    name: "Allow it in System Settings",
    body: (
      <>
        <p>
          Open <strong>System Settings</strong> from the Apple menu, click <strong>Privacy &amp; Security</strong> and
          scroll down to <strong>Security</strong>. Next to the message about Glideshot, click{" "}
          <strong>Open Anyway</strong>, then confirm with your password or Touch ID.
        </p>
        <p>
          The button is there for about an hour after step 3. If you don't see it, open Glideshot again and come straight
          back.
        </p>
      </>
    ),
  },
  {
    name: "Allow Screen Recording",
    body: (
      <p>
        Glideshot asks for permission to record your screen. In <strong>System Settings → Privacy &amp; Security →
        Screen &amp; System Audio Recording</strong>, turn on Glideshot. Then quit Glideshot (<Kbd>⌘Q</Kbd>) and open it
        again. That's it.
      </p>
    ),
  },
];

export function InstallGuide() {
  return (
    <>
      <p>
        Glideshot is free and open source. It isn't notarized by Apple (that needs a paid developer membership), so
        macOS asks you to confirm the first time you open it. You only do this once.
      </p>
      <p className="text-ink-48">You need a Mac with Apple silicon (M1 or newer) and macOS 14 Sonoma or later.</p>

      <ol className="steps">
        {INSTALL_STEPS.map((step) => (
          <li key={step.name}>
            <h2>{step.name}</h2>
            {step.body}
          </li>
        ))}
      </ol>

      <Tip title="On macOS 14 Sonoma">
        <p>
          Instead of steps 3 and 4: Control-click Glideshot in Applications, choose <strong>Open</strong>, then click{" "}
          <strong>Open</strong> again.
        </p>
      </Tip>

      <h2>Prefer Terminal?</h2>
      <p>This removes the “downloaded from the Internet” mark, so macOS opens Glideshot without asking:</p>
      <Command>xattr -dr com.apple.quarantine /Applications/Glideshot.app</Command>

      <h2>Troubleshooting</h2>
      <h3>“Glideshot is damaged and can't be opened”</h3>
      <p>
        That's the same check with a scarier message. Run the Terminal command above. If it still won't open, download
        it again and unzip it by double-clicking the zip, because some third-party unarchivers break app signatures.
      </p>
      <h3>There's no Open Anyway button</h3>
      <p>It only appears after a blocked attempt and disappears after about an hour. Open Glideshot again, then go straight to Privacy &amp; Security.</p>
      <h3>The recording is black or only shows the wallpaper</h3>
      <p>
        Glideshot doesn't have Screen Recording permission. If it's already listed and switched on, select it, remove it
        with the <strong>−</strong> button, open Glideshot again and allow it. Quit and reopen after allowing.
      </p>
      <h3>macOS asks again whether Glideshot can record the screen</h3>
      <p>
        Recent versions of macOS check in every now and then on apps that record the whole screen. Choose Allow. You may
        also be asked again after updating Glideshot, because a build that isn't notarized counts as a new app.
      </p>
      <h3>The shortcut doesn't start a recording</h3>
      <p>
        Another app may already use <Kbd>⌃⌥⌘R</Kbd>. You can also start and stop from the Glideshot window or its menu
        bar icon. Without the shortcut, Glideshot won't hide itself while recording, so the Stop button is always within
        reach.
      </p>

      <h2>Updating and uninstalling</h2>
      <p>
        To update, download the new version and replace the app in Applications. You may need to repeat steps 3 to 5.
      </p>
      <p>
        To uninstall, quit Glideshot and move it to the Trash. Your recordings stay in <code>~/Movies/Glideshot</code>.
        To also remove its settings:
      </p>
      <Command>defaults delete xyz.glideshot.Glideshot</Command>

      <h2>Why isn't it notarized?</h2>
      <p>
        Notarization requires a paid Apple Developer Program membership, and Glideshot is a free side project. Everything
        it does is in the <a href={SITE.repoUrl}>source code</a>: it doesn't connect to the internet, and it only records
        <em> that</em> a key was pressed (to zoom in while you type), never which key. If you'd rather not trust a
        download, build it yourself with <code>./build.sh</code>. More background:{" "}
        <a href="/blog/open-apps-not-notarized-macos/">why macOS blocks apps that aren't notarized</a>.
      </p>
    </>
  );
}
