# Microsoft Edge Add-ons

RulerSNX uses the same Chromium Manifest V3 package for Chrome and Edge:

`chrome-artifacts/rulersnx-chrome-1.3.1.zip`

The package was rebuilt from the current `main` branch and contains a Chromium service
worker, version 1.3.1, and no Firefox-only metadata. In Edge, the unpacked build can be
checked from `edge://extensions` with Developer mode and **Load unpacked** pointing to
`dist/chrome`.

To publish, sign in to the Microsoft Edge Partner Center, create an extension listing,
upload the ZIP, complete the listing and privacy fields, then submit it for review. No
Edge listing has been submitted from this workspace yet; the account and publisher
review are handled in Microsoft's portal.
