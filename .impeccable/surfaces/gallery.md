# 사진 gallery direction contract

Mode: Operate / Experience. Extend the established note/carddav/caldav series.
Connection uses an app-owned 보관함 연결 screen with one primary action, a dark
authentication window, and inline preparing/waiting/cancel/retry states. Official
Tailscale authentication stays in its browser; completion returns to photos.
The user explicitly requested the same series theme. No replacement visual world
or invented personal photograph collection is authorized.

FIRST VIEWPORT: 226px charcoal navigation rail and a compact single-row gallery
header: library context/count and a newest/oldest sort toggle. The library title
uses 17px/600 Pretendard on a 24px line to balance the hamburger icon. Search, date filters,
column select, refresh and the visible all-photos heading are removed at the user's request. Photographs
supply color; chrome stays neutral. Mobile opens a full-screen navigation menu, keeps a
bottom navigation bar, and supports 1–6 columns by pinch.

Bottom destinations are photos, favorites, folders, map and albums, shown as icons
with accessible names in a 49px bar plus the device safe area. Backup lives
under Settings > 사진 백업. Albums use photo-cover tiles in two mobile columns,
an inline name form with optional inclusive capture-date range, and a three-column photo picker.
Date-based creation fills the album once; users then freely edit membership.
Album membership references
originals without copying or moving them. The private API persists albums per
authenticated account, supports rename/delete, and adds/removes up to 200 photos
per selection. Empty, loading and retry states remain available.

Sorting is a single button: each tap switches directly between 최신순 and 오래된순. No popover or explanatory copy. A fixed width avoids header movement; the label fades in over 160ms and the direction arrow rotates over 240ms. Native button keyboard activation and reduced motion are preserved.

The menu uses the same fixed toggle before and after opening: three lines become
an X over 280ms. Full-screen navigation enters in 260–320ms and exits in 180ms.
Reduced motion keeps an 80ms fade with an immediate glyph change. Keyboard focus
stays inside the menu; Escape and destination selection close it.

Settings uses the same 17px/600 title as the gallery and preserves the X toggle and its position. Every X close control returns
to all photos, clears filters, resets newest sorting and automatic columns, and
returns the gallery to the top. The mobile menu omits destinations already in the
bottom navigation and keeps settings/downloads and library management. Settings keeps
사진 백업, NAS 공유 폴더, Tailscale and one logout action; it folds source paths/dates
into disclosure and omits redundant headings, cache clearing, manual rescanning and bottom navigation.
Logout ends authentication and stops automatic backup while preserving local photo records,
thumbnails, the backup destination and Wi-Fi preference.

A short white 4px timeline pill sits flush against the left edge, without a background
track or month numbers. It fades in over 360ms during scrolling and out over
260ms. The touch target stays 44px wide.
Dragging or keyboard focus reveals the active year/month beside the bar.
Folders, map and albums share the gallery's compact one-row header and 17px/600
title, without descriptive subtitles. All bottom tabs and settings share a 48px mobile
header (plus the top safe area), with no extra gap before the content surface.
The map uses locally bundled public-domain Natural Earth data with pure black water,
near-black land, quiet boundaries and Pretendard labels. Zoom buttons are removed;
pinch, wheel and keyboard zoom remain available. Photo markers have no thick rim.
No attribution control or remote map services. Zoom is limited to 1–8 for regional
context; photo clusters and individual-photo selection remain interactive.

Signature interaction: selecting a photograph opens a quiet full-screen viewer,
with keyboard next/previous, original download, zoom, EXIF metadata and favorite.
Returning preserves the gallery scroll. Visible rows alone render; four media
requests may run concurrently. Cached thumbnail bytes stay on the device.

Photo and video thumbnails enter multi-selection after a 500ms hold or a context-menu
action. Tapping toggles each selection; stored photo IDs survive virtual scrolling.
Moving, scrolling or starting a pinch cancels the hold. A compact bottom action bar
shows cancel, selection count and delete. Deletion requires explicit confirmation
that NAS originals and album references will be removed. Cancel receives initial
focus. Partial failures can retry only failed photos. Offline deletion is unavailable.
The top mobile hamburger, settings and download controls keep transparent backgrounds
on hover and press, with keyboard focus indication preserved.
The navigation menu omits the duplicate connect-folder button and the account/status
footer. The plus beside 내 보관함 remains the folder-connection entry point.

Quality bar: same Pretendard font and neutral tokens as the sibling projects;
Korean action labels; keyboard focus; usable 390px layout; real loading, failure,
empty and offline states. NAS credentials and implementation secrets are never
shown. Only app settings explain the information needed to connect a share.

Verification imagery under .impeccable/review is a local diagnostic fixture of
36 solid color JPEGs with synthetic GPS coordinates. These files and the local
authentication stub are not production assets or an actual user photo library.
The production page starts with Tailscale authentication and an empty library.
