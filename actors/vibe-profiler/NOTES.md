# Scraper notes (verified 2026-10-24)

Input schemas were read from `GET /v2/acts/<actor>/builds/default` (`data.inputSchema`), output fields from one tiny real run per scraper (3 items each) against public brand accounts, cross-checked with each build's dataset schema (`data.actorDefinition.storages.dataset`). All three scrapers are pay-per-event.

## apify/instagram-scraper (build 0.0.830)

- Input used: `directUrls: ["https://www.instagram.com/<handle>/"]`, `resultsType: "posts"`, `resultsLimit: <n>` (per URL), `addParentData: false`. Other options: `onlyPostsNewerThan`, `search`/`searchType`/`searchLimit`.
- Output fields used: `caption`, `hashtags` (string[], original case, no `#`), `locationName` / `locationId` (only present when a place is tagged; null on the natgeo probe), `timestamp` (ISO), `type` (`Image` | `Video` | `Sidecar`), `productType` (`feed` | `clips` | `carousel_container` | `igtv`), `alt` (auto alt text: `"Photo by <owner> on <date>. May be an image of ..."`), `ownerUsername`, `inputUrl` (the URL we passed; used to group items by handle because collab posts can have another owner).
- Fields we never read and strip from fixtures: `latestComments`, `firstComment`, `taggedUsers`, `coauthorProducers`, `mentions`, `childPosts`, media URLs.
- Error items carry `error` + `errorDescription`.
- Price: $0.0027 per result (free tier), no start fee. Default memory 1024 MB (ran at 512 MB).

## clockworks/tiktok-scraper (build 0.0.620)

- Input used: `profiles: ["<handle>"]`, `resultsPerPage: <n>` (per profile), `profileScrapeSections: ["videos"]`, `profileSorting: "latest"`, all `shouldDownload*: false`, `downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES"`, `commentsPerPost: 0`, `maxFollowersPerProfile: 0`, `maxFollowingPerProfile: 0`. Date filters (`oldestPostDateUnified`, `newestPostDate`) cost extra per result, so we don't use them.
- Output fields used: `text`, `hashtags` (objects `{ id, name, title, cover }`; we read `name`), `createTimeISO` (ISO) and `createTime` (unix seconds), `isSlideshow`, `locationMeta` (`{ address, city, cityCode, countryCode, locationName, locationId }`, only when geotagged), `input` (the handle we passed), `authorMeta.name`.
- Price: $0.0037 per result + $0.001 actor start (free tier). `minimalMaxTotalChargeUsd` is $0.50, so our charge cap never goes below that.

## apify/facebook-posts-scraper (build 0.0.404)

- Input used: `startUrls: [{ "url": "https://www.facebook.com/<page>" }]` (required), `resultsLimit: <n>` (per page), `captionText: false` (video transcripts off). Other options: `onlyPostsNewerThan` / `onlyPostsOlderThan` (extra cost).
- Output fields used: `text`, `time` (ISO) and `timestamp` (unix seconds), `isVideo` (true or missing), `media[]` (`__typename` `Photo` | `Video`, `ocrText` = Facebook's image description), `inputUrl` / `facebookUrl` (the page we passed), `pageName`.
- No hashtag field: hashtags are extracted from `text`. No tagged-location field: `locationName` is always null.
- Fields we never read: `topComments` (commenter names), `user`, `textReferences`, `collaborators`.
- Price: $0.005 per post + $0.001 actor start (free tier). Public pages only, not personal profiles.

## Runs made while building

| Run | Scraper | Items | Cost |
| --- | --- | --- | --- |
| QfX8gqK1XSWVYYS2a | instagram-scraper, natgeo | 3 | $0.0081 |
| VbRZSg5ubyqJbflTd | tiktok-scraper, nba | 3 | $0.0121 |
| N4d0zcLYejCE2rwQD | facebook-posts-scraper, nasa | 3 | $0.0160 |
| K3vAjptCdOOapmqHp | instagram-scraper (via `apify run`) | 6 | $0.0162 |
| hQQJLv9Ux7ygY4hti | tiktok-scraper (via `apify run`) | 6 | $0.0232 |
| e9juH3l1T6jmBFYco | facebook-posts-scraper (via `apify run`) | 6 | $0.0310 |

Total: $0.107. All six runs' default datasets and key-value stores were deleted afterwards (the `apify run` ones by the actor itself).

## Gotchas

- `run.usageTotalUsd` returned by `actor().call()` can still read 0 right after the run finishes; fetch the run again later for the final figure.
- `maxItems` on a call only caps pay-per-result actors; these are pay-per-event, so `createApifyCallActor` also sets `maxTotalChargeUsd` (about 2x the per-post price, floor $0.50).
- Hashtag stems match as prefixes or suffixes (`ramenlover`, `bestramen`), mid-word only for 6+ letter stems: plain substring matching put `ramen` in `#sacramentokings`.
