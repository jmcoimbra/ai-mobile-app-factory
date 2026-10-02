# 0006: store paths for the public and the corporate flavor

- Status: Accepted
- Date: 2026-10-02

## Context

The public flavor is an ordinary store listing. The corporate flavor has to
reach the staff of one organization and stay out of public search. Both
vendors have several official ways to do that, with different owners, costs
and limits.

### What the vendors offer

| Path | Who the vendor says it is for | Cost | Store review | Device management | Main limit |
|---|---|---|---|---|---|
| Managed Google Play private app | "Private apps are intended to be built and used by an individual enterprise" | 25 USD once through the Play Console; no fee when published from an EMM console | A "streamlined verification process" | Distribution happens from the organization's EMM console | Up to 1000 organizations per app. Once private, the app can never become public |
| Apple custom app, private distribution | "proprietary apps for internal use within your organization" | Apple Developer Program, 99 USD a year | Yes, under the same guidelines, typically 1 to 2 days | Device management for managed distribution, or redemption codes | The distribution method cannot change after approval |
| Apple unlisted app | "part-time employees, franchisees, partners" and other limited audiences, and employee-owned devices that cannot be managed | Apple Developer Program | Yes | None needed | "available to anyone who has access to the link" |
| Apple Developer Enterprise Program | Large organizations distributing in-house apps | 299 USD a year | None through the App Store | Device management or a website | 100 or more employees, a verification interview, profiles that expire every 12 months |
| Firebase App Distribution | "trusted testers", for apps that "have not yet been publicly released" | No cost | None | None | 500 testers per project, releases removed after 150 days. On iOS, ad hoc builds install only on registered devices |

Apple renamed Apple Business Manager to Apple Business. Its pages now use the
new name.

### Two facts checked before use

**Android developer verification.** Since September 30, 2026 an app
installed from a participating store on a certified device in Brazil,
Indonesia, Singapore or Thailand must belong to a verified developer with
the package name registered. Google's pages disagree on direct installs. The
FAQ says the date "only applies to the specific participating stores" and
that for sideloaded apps the requirements "won't apply to your app yet". The
limited distribution guide says unregistered package names "will no longer
be installable on certified Android devices in those regions". This project
treats registration as required for every package name. Creating the app in
the Play Console registers the name. Apps on fully managed devices or inside
a work profile are exempt, and Google still recommends registering them.

**Firebase App Distribution on iOS.** It is a pre-release tool. An ad hoc
build installs only on devices whose identifier is in the provisioning
profile, and Apple allows 100 registered devices per product family per
membership year: 100 iPhones and, separately, 100 iPads. Removing a device
does not return the slot before the yearly reset.

## Decision

| Flavor | Android | iOS |
|---|---|---|
| `public` | Google Play, production track | App Store, public distribution |
| `corporate` | Managed Google Play private app, restricted to the organization | Custom app with private distribution through Apple Business |
| Pre-release, both | Google Play internal testing (up to 100 testers) | TestFlight (100 internal, 10,000 external testers, builds valid 90 days) |

- The two flavors have different package names and bundle identifiers. This
  is forced by both stores: a Google Play app restricted to organizations
  stays private for good, and an Apple app cannot switch between public and
  private distribution after approval.
- Staff install the corporate flavor from the organization's managed store.
  Device management is the organization's side of the contract and is
  outside this repository.
- **Apple unlisted distribution is the documented fallback** for staff on
  personal phones the organization cannot manage. The link is the only
  barrier, so the app then needs its own sign-in.

**Discarded: Apple Developer Enterprise Program.** Apple states that the
standard program with custom apps "is the right option for most
organizations", and the enterprise program adds an eligibility interview and
yearly profile expiry.

**Discarded for production: Firebase App Distribution.** It is scoped to
testers and, on iOS, capped by the registered device limit.

**Discarded: an APK or IPA pushed outside the stores.** On Android it falls
under developer verification outside managed devices, and on iOS it requires
the enterprise program or registered devices.

## Consequences

- The organization needs a managed Google Play enterprise and an Apple
  Business account, each with an organization identifier the publisher
  targets.
- An organization enrolling in the Apple Developer Program needs a D-U-N-S
  number. So does an organization account on Google Play.
- A personal Google Play account created after November 13, 2023 must run a
  closed test with at least 12 testers for 14 days before production.
- The first submission to each store is a manual, approved step. See spec
  0001.

## Sources, read on 2026-10-02

- https://developer.android.com/developer-verification
- https://developer.android.com/developer-verification/guides/faq
- https://developer.android.com/developer-verification/guides/limited-distribution
- https://developer.android.com/developer-verification/guides/google-play-console
- https://support.google.com/work/android/answer/17266330
- https://support.google.com/googleplay/android-developer/answer/9874937
- https://support.google.com/googleplay/work/answer/10637198
- https://developers.google.com/android/work/play/custom-app-api/get-started
- https://support.google.com/googleplay/android-developer/answer/9845334
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/6112435
- https://firebase.google.com/docs/app-distribution
- https://firebase.google.com/docs/app-distribution/register-additional-devices
- https://firebase.google.com/docs/app-distribution/troubleshooting
- https://developer.apple.com/help/account/devices/devices-overview/
- https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods/
- https://support.apple.com/guide/business/learn-about-custom-apps-axm58ba3112a/web
- https://developer.apple.com/support/unlisted-app-distribution/
- https://developer.apple.com/programs/enterprise/
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
- https://developer.apple.com/help/account/membership/program-enrollment/
