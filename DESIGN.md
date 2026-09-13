---
name: "사진"
description: "Private photo browsing in the established note/carddav/caldav series."
colors:
  bg: "#111"
  sidebar: "#141414"
  workspace: "#191919"
  surface: "#1d1d1d"
  field: "#222"
  secondary: "#272727"
  selected: "#292929"
  text: "#ededed"
  muted: "#a0a0a0"
  navigation: "#b9b9b9"
  navigation-active: "#f2f2f2"
  secondary-text: "#ddd"
  primary: "#e6e6e6"
  primary-hover: "#fff"
  line: "#ffffff10"
  field-border: "#ffffff20"
  hover: "#ffffff0b"
  active: "#ffffff12"
  focus: "#b9b9b9"
  count-text: "#aaa"
  viewer: "#101010"
  viewer-text: "#eee"
  caption: "#111a"
  icon: "#b8b8b8"
  online: "#b6c1b5"
  switch-off: "#444"
  switch-thumb: "#aaa"
  switch-thumb-on: "#333"
  mark-violet: "#a37bf2"
  mark-pink: "#ef8bc9"
  mark-coral: "#fa897c"
  mark-apricot: "#f8b16b"
typography:
  display:
    fontFamily: 'Pretendard, "Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "34px"
    fontWeight: 550
    letterSpacing: "-0.03em"
  headline:
    fontFamily: 'Pretendard, "Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "23px"
    fontWeight: 650
    letterSpacing: "-0.03em"
  title:
    fontFamily: 'Pretendard, "Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: 'Pretendard, "Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "14px"
  paragraph:
    fontFamily: 'Pretendard, "Segoe UI", "Malgun Gothic", sans-serif'
    lineHeight: 1.65
  label:
    fontFamily: 'Pretendard, "Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "12px"
  action:
    fontFamily: 'Pretendard, "Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "13px"
  primary-action:
    fontFamily: 'Pretendard, "Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "13px"
    fontWeight: 550
  count:
    fontFamily: 'Pretendard, "Segoe UI", "Malgun Gothic", sans-serif'
    fontSize: "11px"
    fontWeight: 450
    letterSpacing: "0"
rounded:
  photo: "3px"
  thumbnail: "4px"
  count: "5px"
  control: "8px"
  search: "9px"
  add-library: "10px"
  panel: "12px"
  switch: "14px"
  map-marker: "15px"
  circle: "50%"
spacing:
  gallery-gap: "6px"
  control-gap: "8px"
  compact: "10px"
  control: "12px"
  panel-gap: "17px"
  section: "24px"
  content: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.workspace}"
    typography: "{typography.primary-action}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-text}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-icon:
    textColor: "{colors.icon}"
    rounded: "{rounded.control}"
    width: "36px"
    height: "36px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  navigation:
    textColor: "{colors.navigation}"
    rounded: "{rounded.control}"
    padding: "12px"
    width: "100%"
  navigation-active:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.navigation-active}"
  count:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.count-text}"
    typography: "{typography.count}"
    rounded: "{rounded.count}"
    padding: "3px 6px"
  photo-tile:
    backgroundColor: "{colors.field}"
    rounded: "{rounded.photo}"
    padding: "0"
  source-form:
    backgroundColor: "{colors.field}"
    rounded: "{rounded.panel}"
    padding: "22px"
  switch:
    backgroundColor: "{colors.switch-off}"
    rounded: "{rounded.switch}"
    width: "42px"
    height: "24px"
    padding: "3px"
  switch-on:
    backgroundColor: "{colors.secondary-text}"
---

# Design System: 사진

## Overview

사진 follows the existing note, carddav and caldav series: Pretendard, neutral dark surfaces, a compact navigation rail and the established gradient app mark. Korean labels and restrained controls keep the photographs visually dominant.

This is a record of the finished web interface, including the shared interface used by the Android wrapper. The confirmed series identity is the design authority; no separate creative north star has been introduced.

**Key Characteristics:**

- Neutral dark chrome with light primary actions.
- Compact Pretendard typography and thin separators.
- Dense square photographs, with information revealed on interaction.
- The existing gradient picture mark identifies the app.

Extracted from `src/styles.css`, `src/App.tsx`, `src/MapView.tsx` and `public/favicon.svg`, against the confirmed series commitment in `PRODUCT.md` and `.impeccable/surfaces/gallery.md`. Token names above describe implemented values; this documentation does not add a CSS token layer.

## Colors

### Primary

The primary action uses pale neutral fill with dark text and becomes white on hover. The app mark supplies the chromatic identity: its violet, pink, coral and apricot stops form a diagonal gradient. The gradient is confined to the picture glyph on its dark rounded square.

### Neutral

The page ground, sidebar, workspace and field fills provide closely spaced dark layers. Muted text distinguishes supporting information from headings. Translucent white lines divide structural regions and outline fields; hover and pressed treatments are similarly neutral. Selected navigation uses a brighter dark fill and light text.

The viewer uses its own near-black ground and light text. A subdued green-gray dot indicates connection; it is a small state accent, not a second action palette. Errors and warnings use readable neutral banners and explicit Korean copy.

## Typography

Pretendard is bundled as a variable WOFF2 font with a declared weight range of 45–920 and `font-display: swap`. The fallback stack is recorded above. Controls inherit the same family; there is no separate display or monospace face.

The display role is the login heading; ordinary page headings use the headline role, section headings use title, and supporting labels use compact type. Body font size is declared globally, while paragraph line height is a separate rule rather than a universal line-height token. The brand wordmark uses 25px at weight 650.

At widths up to 640px, page headings become 21px and login headings become 30px. Supporting copy commonly uses 11–13px; status text uses 9–10px. Empty-state headings use 19px at weight 550 on desktop. Settings hints cap at 65ch and descriptive settings copy at 55ch.

## Layout

The application occupies 100dvh, with an independently scrolling workspace beneath fixed header controls and above a compact status footer. The desktop rail is 226px wide; it becomes 200px at widths up to 900px and 242px at widths from 1500px. At widths up to 640px it becomes a fixed 242px drawer with a dark scrim. Closed mobile navigation is inert.

Desktop headers use 28px horizontal padding, expanding to 38px on wide screens. Mobile headers use 17px, with safe-area top spacing. The mobile gallery uses 10px left and 4px right margins with a reserved scrollbar gutter. Mobile footer padding accounts for the bottom safe area.

The gallery computes its column count as the greater of two and the integer container width divided by the selected density, 190 or 270. Tiles are square with a 6px gap. At the reviewed 390px viewport this yields two columns; it is not a fixed two-column CSS breakpoint. Only visible rows plus two rows of overscan on each side render.

Settings content is capped at 790px; folder lists at 900px. The source form has two columns, collapsing to one at 640px. At 900px, filter controls stack vertically and the search shortcut hint disappears.

The viewer fills the viewport. Desktop metadata occupies a 280px side panel; mobile metadata becomes a bottom overlay capped at 55% of the viewer body. Map cluster selection uses a 320px side panel on desktop and a bottom panel capped at 55% on mobile.

## Elevation & Depth

Most depth comes from tonal fills, thin borders and layering. Cards, buttons and the sidebar have no general-purpose box shadow. Map markers use `0 4px 12px #0005`; favorite hearts use `drop-shadow(0 1px 3px #000)` for visibility over photographs. The mobile drawer scrim uses `#0008`. Map tiles receive grayscale, inversion, brightness and contrast filtering to fit the surrounding dark interface.

The shared easing is `cubic-bezier(0.16, 1, 0.3, 1)`. Image dimming and caption reveal take 180ms; viewer zoom takes 200ms; viewer entry takes 220ms; the drawer takes 230ms. Viewer entry animates opacity and an inset clip. The loading icon rotates over 1.1s. Reduced-motion preferences reduce animation and transition duration to 0.01ms and limit animation to one iteration.

## Shapes

Photographs have almost square corners. Standard controls have gently rounded corners, while source forms, update notices and map selection panels use the larger panel radius. Counts are small rounded rectangles, not filter pills. Circular forms are reserved for the account icon, connection dots and switch thumb.

The favicon uses a 32-unit square with a 9-unit corner radius. Its picture outline uses a 1.8-unit gradient stroke with rounded caps and joins. Reuse the existing SVG rather than recreating the mark.

## Components

### Buttons

Primary and secondary actions share compact inline layout, an 8px icon gap and a 39px minimum height. Icon buttons are 36px square by default. Primary actions use a pale fill; secondary actions use a dark fill. Disabled buttons have half opacity. Standard hover and active states use the neutral overlays, while primary hover remains white.

Keyboard focus uses a 2px neutral outline with a 3px offset. Photo buttons put that outline inside the tile. Viewer icon controls shrink to 32px by 34px on mobile. Retain the current compact sizing when extending this series; do not infer larger target sizes from this document.

### Inputs and Search

Fields use a thin translucent border, 40px minimum height and the standard control radius. Placeholders are muted. Search wraps an unbordered input and icon in a 42px shell, becoming 40px on mobile. Search focus changes the shell border to `#999`; the nested input outline is deliberately suppressed. Date filters use smaller controls than ordinary fields.

### Navigation and Counts

Navigation combines a 19px line icon, Korean label and optional trailing count. Rows have 12px padding, an 11px gap and a 43px minimum height. Active rows use the selected surface and brighter text; source selection uses the field surface. A small count badge sits beside gallery headings. The app has no generic chip or tag system.

### Photo Tiles and Viewer

Photo tiles crop thumbnails with `object-fit: cover`. Hover dims the image to 0.78 brightness; hover or keyboard focus reveals the date caption over a translucent dark strip. Favorite hearts remain visible in the top-right corner. Loading and image failure use explicit icon placeholders.

Opening a photograph creates a modal dialog. The viewer contains the image with `object-fit: contain`, supports previous/next arrows and keyboard navigation, and offers favorite, original download, zoom and metadata controls. Closing restores the triggering element's focus and leaves the gallery mounted. Metadata and file names wrap or truncate within their regions.

### Containers and Settings

The source form is a tonal panel with compact labels, a 17px grid gap and right-aligned actions. Settings and folder entries otherwise use flat rows with separators. Empty states center a line icon, short heading, explanatory text and an applicable action; they do not introduce sample library content.

### Switch and Status

The automatic backup switch has a 42px by 24px track and an 18px circular thumb. Its enabled state changes to a pale track and moves the dark thumb 18px. This control appears in the Android interface; the web interface shows an app-download action in its place. Scanning, connection, error and offline information use text plus small icons or dots.

### Map

The map uses dark-filtered OpenStreetMap tiles and count markers, 42px square or 54px when the count exceeds ten. A marker for one photo opens it; a cluster opens its photo list. Cluster rows use 55px thumbnails, filenames and Korean dates, with another 30 entries available per load-more action. Map attribution remains visible.

## Do's and Don'ts

### Do's

- Do preserve the note/carddav/caldav series identity and the existing gradient app mark.
- Do use Pretendard and Korean labels across navigation, forms and states.
- Do keep photo content dominant and use neutral surfaces for the surrounding controls.
- Do preserve visible keyboard focus, reduced-motion behavior and independently scrolling content.
- Do distinguish authentic empty, loading, error and offline states.

### Don'ts

- Don't introduce a replacement visual identity or spread the logo gradient across ordinary controls.
- Don't turn the gallery into a collection of padded promotional cards.
- Don't treat diagnostic fixture photographs as a real photo collection or shipping content.
- Don't assume every mobile width has exactly two columns; the gallery calculates columns from its measured container.
