# Production Desk routing — first version

The app owns its stop optimizer and authenticated `/api/routing` API. It uses a
self-hosted OSRM road-time matrix and self-hosted Photon address search backed by
OpenStreetMap. Google is not used for either function. Existing navigation links
may still open a user's maps application.

## What is included

- Schedule → Optimize crew route, with up to eight assigned stops on one day.
- Admin-managed warehouses for each market, morning loading time, working hours,
  optional warehouse return, and a configurable driving-time allowance.
- Estimated work time entered for each stop. AM/PM and specified start times are
  constraints on when a visit starts. Work must finish within crew working hours.
- Exhaustive ordering of small daily routes, minimizing finish time and then
  driving time. No job is silently omitted and no straight-line distance is used
  as road travel time.
- Review before saving. Dates, customer windows, statuses and crew assignments
  remain unchanged. Saving writes stop order, estimated times and job history.
- Thirty-minute previews; version checks reject changed jobs, changed warehouse
  settings, new/removed appointments, expired previews, and installer days off.
- Address suggestions fill street, city, state and ZIP in Add Customer and Update
  Information, and retain selected coordinates. Editing the address invalidates
  its old coordinates. Manual addresses and manually confirmed coordinates work.

## Connect the map services

1. Provision OSRM and Photon on infrastructure controlled by the company. Import
   road and address data covering all operating areas (Florida, Texas, Louisiana).
   Regional import sizes and memory requirements must be checked against the
   selected OSRM/Photon releases and data extracts before sizing that host.
2. Keep these long-running services outside Vercel functions. Put HTTPS and an
   authenticated reverse proxy in front of them. Both must be reachable from the
   app's server environment; do not expose their administrative/import endpoints.
3. Set server-only Vercel environment variables, then redeploy:
   - `OSRM_BASE_URL`: root of your OSRM HTTP service.
   - `PHOTON_BASE_URL`: root of your Photon HTTP service.
   - `MAP_SERVICE_TOKEN`: bearer secret checked by your reverse proxy (if enabled).
   Never use a `NEXT_PUBLIC_` name for that secret or commit it to GitHub.
4. Admin opens Schedule → Optimize crew route → Warehouse setup. Enter a name,
   full warehouse address and confirmed coordinates, hours and loading time.
5. Choose the planning date, crew and warehouse. Enter each job's estimated work
   duration, confirm map locations and preview. Save after reviewing every stop.

No paid hosting resources or map servers are provisioned by this code update.
Without the configured services, routing is unavailable and address entry stays
manual. Public OSRM/Photon demo servers and public Nominatim autocomplete are not
used as fallbacks. No new database migration is required: warehouse and preview
records use the existing operations configuration table.

## Limits and next steps

This version optimizes already-assigned jobs. It does not distribute jobs across
crews, account for live traffic, infer install durations from product counts,
provide turn-by-turn navigation or promise customer arrival times. Estimated
starts are shown as route estimates, not new customer appointment commitments.
A separate integration API-key lifecycle can be added when another system needs
access; the app currently authenticates routing through existing staff sessions.

Before production use, validate against actual crew days in each market, including
bridge/toll routes, ambiguous addresses, difficult access and long installations.
Keep road/address extracts updated. Show OpenStreetMap attribution wherever the
results appear.

Primary documentation:
- https://project-osrm.org/docs/v5.24.0/api/#table-service
- https://github.com/Project-OSRM/osrm-backend
- https://github.com/komoot/photon/blob/master/docs/api-v1.md
- https://github.com/komoot/photon/blob/master/docs/usage.md
- https://www.openstreetmap.org/copyright
