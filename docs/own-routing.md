# Production Desk routing — first version

The app owns its stop optimizer and authenticated `/api/routing` API. It uses a
hosted Geoapify driving-time matrices and address autocomplete when configured,
or self-hosted OSRM and Photon as an alternative. Google is not used for either function. Existing navigation links
may still open a user's maps application.

## What is included

- Schedule → Optimize crew route, with up to eight assigned stops on one day.
- Admin-managed warehouses for each market, morning loading time, working hours,
  optional warehouse return, and a configurable driving-time allowance.
- Estimated work time entered in hours for each stop. AM/PM and specified start times are
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

## Connect the free hosted service (recommended)

1. Sign up at https://myprojects.geoapify.com/ using a company-controlled account.
   Select Free and create a Production Desk project. No credit card is required.
2. Put its key in Vercel as the **server-only** `GEOAPIFY_API_KEY` for the intended
   environments and redeploy. Never paste the key into chat or commit it to git.
3. Verify Add Customer address suggestions, street/city/state/ZIP population and
   an actual crew route before promoting the deployment to production.
4. Admin opens Schedule → Optimize crew route → Warehouse setup and adds each
   warehouse with working hours and loading time; its address is located automatically.

The app sends address search text and route coordinates to Geoapify, not customer
names, account IDs or job instructions. The key stays on the server. No paid plan
or auto-upgrade is enabled by this code. Address input is debounced (600ms), and
routing is requested only on preview. Check usage in the provider dashboard.

As checked October 19, 2026, Free permits commercial production use with attribution,
3,000 credits/day and up to 5 requests/second. A route matrix uses multiple credits:
a warehouse plus four jobs is a 5×5 matrix, normally 25 credits; a warehouse plus
eight jobs is 9×9, normally 81. Long distances can add credits. Address autocomplete
uses one credit per request, not per completed customer. Free does not mean unlimited.
Quota errors leave manual entry available and never substitute made-up travel times.

Geoapify supplies road times; Production Desk's own optimizer chooses stop order.
Census Geocoder accepts full US street addresses and calculates coordinates along
address ranges; it does not provide address autocomplete or driving-time matrices.
It is therefore not used as a replacement for these two functions.

Optional self-hosting remains available by leaving `GEOAPIFY_API_KEY` blank and
setting `OSRM_BASE_URL`, `PHOTON_BASE_URL` and optionally `MAP_SERVICE_TOKEN`.
Use HTTPS with authentication and matching data coverage. Hosted Geoapify takes
precedence when its key is present. No public demo endpoint is used as a fallback.
No map server purchase or database migration is required for the hosted option.

Sources:
- https://www.geoapify.com/pricing/
- https://apidocs.geoapify.com/docs/route-matrix/
- https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/
- https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html

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

## Route preview map and automatic locations

The planner resolves full job addresses on the server when no current saved address
location exists. It requires an unambiguous street/city/state/ZIP match; an unmatched
address identifies the job to correct rather than requesting manual coordinates.
Warehouse setup also resolves its address automatically. No coordinate boxes or
manual confirmation are needed. Existing address-matched locations are reused.
Work duration is entered in hours (for example, 1.5) and converted to integer minutes
for optimization and storage. The preview displays warehouse and numbered stops
with actual road geometry in optimized order, including the optional warehouse
return. It uses a separate Geoapify routing request (or OSRM route request). If road
geometry fails, the preview explains this and retains the stop list and estimates;
it never draws a straight line and labels it as a driving route. Map tiles use the
existing OpenStreetMap tile layer and attribution.

Opening the optimizer and choosing a crew automatically checks that day's addresses.
Verified locations are saved against the current address and reused. Only unmatched
addresses show an inline street/city/state/ZIP editor, with autocomplete. Saving
verifies the correction, updates the customer account and job history, and clears
stale route estimates. Permission checks and address fingerprint checks prevent
installer access and overwriting a concurrent address edit. Provider outages offer
a retry instead of asking staff to change a valid address.
