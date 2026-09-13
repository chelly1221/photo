# 사진
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Existing series architecture: React/TypeScript with Capacitor Android and embedded Tailscale WASM. Photo-specific server index and thumbnail worker.

## Users
The owner of a private NAS at 100.75.89.101, browsing photos on desktop and phone.

## Product Purpose
Connect NAS shared folders from the app, browse photographs quickly, explore GPS clusters on a map, and automatically back up phone photographs to the NAS.

## Capabilities and Constraints
User-confirmed: add NAS shares in the program; include phone automatic backup in the first version. Remote host 3chan@100.89.61.28. Public web photo.3chan.kr. Embedded Tailscale like note. Preserve existing originals; write backups only to an explicitly selected destination. No fabricated photo library.

## Brand Commitments
App name 사진. Match note, carddav and caldav series theme and properly provide favicon, PWA and Android launcher icons. Korean copy.

## Open Decisions
Which shares to connect and which folder should receive backups are chosen inside the app. Android is the existing series mobile target; iOS distribution is not established.
