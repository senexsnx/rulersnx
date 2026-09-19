# Safari Web Extension preparation

`rulersnx-safari-1.3.1.zip` is a Safari Web Extension source candidate generated from
the current Chromium build. It contains the MV3 extension files at the archive root,
including the service worker, icons and `manifest.json`.

SHA-256: `6B78EFA89C48AD20B1A79020377D68219CE6611B07E234FB69455DEE34184B68`.

Apple's Safari Web Extension Packager can turn an existing web-extension ZIP into the
Safari app-extension package. The package still needs to be validated in Safari and
submitted through App Store Connect. Distribution requires an Apple Developer Program
membership and an Apple signing identity; neither is available in this workspace, so
the Safari package is prepared but not published.

Before submission, test the package in Safari on macOS/iOS and confirm the service-worker
and `activeTab`/`scripting` behavior on the target Safari versions. The extension does
not request permanent host permissions or send data to a server.
