## General principles

- Switching pages should not clear any results, going to another page and back again should show the last query in there
- All data is cached for now so that the user can be combine existing queries
- Where possible auto fill in every UI field to make it easier to search with less clicks. For example dates could default to today + 1 and return to today + 8
- Auto suggest dep and arr ports with most recently searched ones, add location name next to them as you type so it is easier to see we have the right one
- It is very important that code / ui changes does not invalidate or delete cached results
- UI responsiveness and ease of use is utmost important

## Credit system

- Users can log in for free through google
- Users can browse cached data from the last 24 hours
- Users can be $5 USD for 1000 search credits to search for custom routes
- Admin users have 10,000 search credits per month
- Users can become admins if they contribute to the git repo and email is white listed (owner is decider of contribution worthiness)
- Owner user has unlimited searches

## UI Layout

App
├── Route Search
├── Time Sweep
├── Scatter
├── Past Queries

## Search Functionality

| Page         | Multiple Origin | Multiple Destinations | Multiple Date | Return Option | New Query        |
| ------------ | --------------- | --------------------- | ------------- | ------------- | ---------------- |
| Route Search | No              | No                    | No            | Yes           | Yes              |
| Time Sweep   | No              | No                    | Yes           | Yes           | Yes              |
| Scatter      | Yes             | Yes                   | No            | No            | Yes              |
| Past         | Yes             | Yes                   | Yes           | Yes           | No - Cached only |

## Results Views

Views take filtered itineraries as inputs and display the information in different ways for different pages.
Each part of the site needs to re-use the same view for consistency

| Page         | Table of Itineraries View | Map View | O&D Table Matrix |
| ------------ | ------------------------- | -------- | ---------------- |
| Route Search | Yes                       | Yes      | No               |
| Time Sweep   | Yes                       | Yes      | No               |
| Scatter      | Yes                       | Yes      | Yes              |
| Past         | Yes                       | Yes      | Yes              |

### Map View

- Shows itineraries grouped by Origin & Desintation.
- Journey is shown with a dashed line.
- Should show the journey with the way point on the way. It should wrap around the world correclty over the date line depending on the journey
- Lowest price is shown at each destination and origin.

## Generic Result Filters

The principle is that the query should get and store all results. The user can then filter those results dynamically without searching again.
The filter UI should be shared across all tabs.
For pages with an outbound and inbound journey, the filters should be duplicated for each journey.

**Filters**

- Direct, <=1 Stop, <= 2 Stop - Defaults to <= 2 stops
- Duration of journey, in buckets of 4 hours from < 4 hours to < 28 hours
- Mixed carriers Y/N
- Carrier filter (should be a dynamic tickbox of carriers from results, multi-select should be enabled, there should be an easy way to select all)
- Dep time filter (between 00:00 and 24:00, a range slider is ideal)
- Arr time filter (between 00:00 and 24:00, a range slider is ideal)
- Departure day of week (MTWTFSS, default to all with no selections made)
- Pages this applies to

| Page         | Outbound | Inbound                  |
| ------------ | -------- | ------------------------ |
| Route Search | Yes      | Yes, if return searched  |
| Time Sweep   | Yes      | Yes, if return searched  |
| Scatter      | Yes      | No                       |
| Past         | Yes      | No, no concept of return |

## Page specific filters

- Time Sweep. One additional filter that is trip length range in days. This should be from the departure date local to the return journey arrival date local. This will affect the combo page only.
