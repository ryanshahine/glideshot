import { SITE } from "../../site/config";
import { Command, type Article } from "../ui";

export const article: Article = {
  slug: "open-apps-not-notarized-macos",
  title: "“Apple could not verify” an app? How to open apps that aren't notarized",
  metaTitle: "How to open an app that isn't notarized on macOS",
  description:
    "Why macOS blocks some apps you download, what notarization is, what changed in macOS Sequoia, and how to safely open an app you trust on macOS 15 and later.",
  published: "2026-10-13",
  body: () => (
    <>
      <p>
        You download an app, double-click it, and macOS refuses:{" "}
        <em>
          “Apple could not verify ‘App’ is free of malware that may harm your Mac or compromise your privacy.”
        </em>{" "}
        The only buttons are Done and Move to Trash. On older versions of macOS you could right-click the app and choose
        Open. On recent versions, that no longer works.
      </p>
      <p>
        This happens with plenty of legitimate software, especially free and open-source apps. Here's what's going on,
        and how to decide whether (and how) to open the app anyway.
      </p>

      <h2>Gatekeeper, signing and notarization</h2>
      <p>
        When you download a file, macOS marks it as quarantined. The first time you open a quarantined app,{" "}
        <strong>Gatekeeper</strong> checks two things:
      </p>
      <ol>
        <li>
          <strong>Is it signed with a Developer ID?</strong> That's a certificate Apple gives to members of its paid
          Apple Developer Program. It shows who made the app and that it hasn't been changed since.
        </li>
        <li>
          <strong>Is it notarized?</strong> The developer uploaded the app to Apple, Apple's automated checks scanned it
          for known malware, and Apple issued a ticket for it.
        </li>
      </ol>
      <p>
        If both are true, the app opens after a short “downloaded from the Internet” confirmation. If not, Gatekeeper
        blocks it.
      </p>
      <p>
        Being blocked doesn't mean the app is malware. It means Apple knows nothing about it. Notarization requires a
        paid developer membership (99 US dollars a year), so many hobby projects and open-source apps ship without it,
        including <a href="/">Glideshot</a>.
      </p>

      <h2>What changed in macOS Sequoia</h2>
      <p>
        Up to macOS 14 Sonoma, the well-known workaround was to Control-click (or right-click) the app, choose Open and
        confirm. macOS 15 Sequoia removed that shortcut. In{" "}
        <a href="https://developer.apple.com/news/?id=saqachfa">Apple's announcement</a>, users now have to go to System
        Settings → Privacy &amp; Security to review the software before allowing it to run. The same goes for every
        macOS version since.
      </p>

      <h2>How to open an app you trust</h2>
      <ol>
        <li>
          Double-click the app. When macOS blocks it, click <strong>Done</strong> (not Move to Trash).
        </li>
        <li>
          Open <strong>System Settings</strong> from the Apple menu and click <strong>Privacy &amp; Security</strong> in
          the sidebar.
        </li>
        <li>
          Scroll down to the <strong>Security</strong> section. You'll see a message that the app was blocked. Click{" "}
          <strong>Open Anyway</strong>.
        </li>
        <li>Confirm, and enter your login password (or use Touch ID).</li>
      </ol>
      <p>
        From then on, the app opens normally. The Open Anyway button only stays available for about an hour after you
        tried to open the app. If you don't see it, double-click the app again and go straight back to Privacy &amp;
        Security.
      </p>

      <h3>On macOS 14 Sonoma and earlier</h3>
      <p>
        Control-click the app in Finder, choose <strong>Open</strong>, then click <strong>Open</strong> in the dialog.
      </p>

      <h3>With Terminal</h3>
      <p>
        If you're comfortable with Terminal, you can remove the quarantine mark yourself. Gatekeeper then treats the app
        as if you hadn't downloaded it:
      </p>
      <Command>xattr -dr com.apple.quarantine /Applications/AppName.app</Command>
      <p>
        This skips the review entirely, so only do it for apps you trust. It's also the usual fix when macOS says an app{" "}
        <em>“is damaged and can't be opened”</em>, which often happens with apps that aren't signed with a Developer ID.
        If that doesn't help, download the app again and unzip it by double-clicking the zip (macOS's own Archive
        Utility), because some third-party unarchivers break an app's signature.
      </p>

      <h2>Should you trust it?</h2>
      <p>
        Gatekeeper exists for good reasons, and Apple warns that overriding it is one of the most common ways Macs get
        infected with malware. Before you click Open Anyway, ask yourself:
      </p>
      <ul>
        <li>
          <strong>Where did it come from?</strong> The developer's own website or official GitHub releases are very
          different from a random download mirror.
        </li>
        <li>
          <strong>Is the source code available?</strong> With open-source apps, anyone can read the code, and you can
          build the app yourself instead of trusting a download.
        </li>
        <li>
          <strong>Does it ask for more than it needs?</strong> A screen recorder needs Screen Recording permission. It
          doesn't need your contacts, Full Disk Access or your administrator password.
        </li>
      </ul>
      <p>
        And don't switch Gatekeeper off entirely, for example with the <code>spctl --master-disable</code> command
        from older tutorials. Allowing one app you trust is fine; dropping the check for every future download isn't.
      </p>

      <h2>Installing Glideshot</h2>
      <p>
        Glideshot isn't notarized, so you'll see this message the first time you open it. The{" "}
        <a href="/install/">install guide</a> walks through the exact steps, including the Screen Recording permission.
        The source code is on <a href={SITE.repoUrl}>GitHub</a> if you'd rather build it yourself.
      </p>
    </>
  ),
};
