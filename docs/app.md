## General principles

- Switching pages should not clear any results, going to another page and back again should show the last query in there
- All data is cached for now so that the user can be combine existing queries
- Where possible auto fill in every UI field to make it easier to search with less clicks. For example dates could default to today + 1 and return to today + 8
- Auto suggest dep and arr ports with most recently searched ones, add location name next to them as you type so it is easier to see we have the right one
- It is very important that code / ui changes does not invalidate or delete cached results
- UI responsiveness and ease of use is utmost important

## Credit system

- Public users can browse cached data from the last 24 hours
- Public users pay $5 USD for 1000 search credits to search for custom routes. Users can by in multiples of 1000.
- Each API call uses 1 credit
- Admin users have 10,000 search credits per month (auto-granted on login each month). It is possible for them to buy more if required.
- Owner user has unlimited searches (no credit tracking)
- Users can become admins if they contribute to the git repo and email is white listed (owner is decider of contribution worthiness)
- Public users: can only log in when ENABLE_PUBLIC_ACCESS=TRUE, otherwise denied

## UI Layout

App
├── Left Hand Panel: Search Query (1)
├── Right Hand:
---├── Top: Filter results (2)
---├── Bottom: Results tabs (3)
├── User tab (4)
├── Admin tab (5) - hidden

## Search Query (1)

Table of query fields shown below. The intent is to auto fill as many possible to make it quick for the user to search.

| Field                  | Default             | Comment                                                                                                            |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Departure Port         | Home port           | 3 letter airport codes, auto correct (airport code first, then airport name, then country), multi-select possible  |
| Arrival Port           | Blank               | 3 letter airport codes, auto correct (airport code first, then airport name, then country) , multi-select possible |
| Departure Date (Begin) | Today + 1           | Start of departure days to search                                                                                  |
| Departure Date (End)   | Today + 1           | End of departure days to search                                                                                    |
| Day of Week            | Blank (meaning all) | MTWTFSS easy to select, filters the departure days we are searching                                                |
| Passengers             | 1                   |                                                                                                                    |
| Currency               | Default Currency    |                                                                                                                    |
| Cabin                  | Economy             |                                                                                                                    |
| Live search            | False               | False means use the cache, true means use a live search. Must warn user about credits being used                   |

Beneath the filters there is a search button
Of the number of search queries, it should flag how many are currently cached and how many would required new api calls.
Next to the search button is the amount of credits they will be using in the search.
Search should remember recently searched items by that specific user.
Moving the departure date begin should appropriately update departure date end

## Results Filters (2)

The principle is that the query should get and store all results. The user can then filter those results dynamically without searching again.

| Filter                | Options                                         | Default          | Multi-select | Comment                                                                |
| --------------------- | ----------------------------------------------- | ---------------- | ------------ | ---------------------------------------------------------------------- |
| Connection            | Direct, <=1 Stop, <= 2 Stop                     | <=2 stops        | N            |                                                                        |
| Duration              | Buckets of 4 hours from < 4 hours to < 28 hours | All              | N            |                                                                        |
| Mixed carriers        | Y/N                                             | Y                | N            | Whether mixed carriers in an itinerary is acceptable                   |
| Carrier filter        | Dynamic based on carriers in results            | None             | Y            |                                                                        |
| Dep Time Filter       | 00:00 to 24:00 time range filter                | 00:00 to 24:00   | Y            |                                                                        |
| Arr Time Filter       | 00:00 to 24:00 time range filter                | 00:00 to 24:00   | Y            |                                                                        |
| Origin                | Unique list of origin ports from results        | All              | Y            |                                                                        |
| Destination           | Unique list of destination ports from results   | All              | Y            |                                                                        |
| Via Points            | Unique list of via ports from results           | All              | Y            | All selected, need a none button. This is to make it easy for the user |
| Departure day of week | MTWTFSS                                         | None meaning all | Y            | Separate from search Day of Week                                       |
| Cabin                 | First, Business, Prememium Economy, Economy     | All              | Y            | Premium_Economy is sent to API                                         |

## Results Views (3)

Views take filtered itineraries as inputs and display the information in different ways for different pages.

### Search Query Build (3.0)

A table of all the queries that will be run are shown, it shows whether there is cached results per row.

### Table View (3.1)

Standard table of itineraries and prices

### Chart View (3.2)

A bar chart of prices, X axis is departure dates.

### O&D Matrix (3.3)

Origins on rows, desintations on columns, minimum price for given filters. Clicking on a cell takes you to the table view with those origin and destinations added to the **Results Filters (2)**

### Map View (3.4)

- Shows itineraries grouped by Origin & Desintation.
- Journey is shown with a dashed line.
- Should show the journey with the way point on the way. It should wrap around the world correclty over the date line depending on the journey
- Lowest price is shown at each destination and origin.

## User tab (4)

- User can select default currency and home port

## Admin Tab (5)

- A hidden tab from the general user, visible to owner / admins
- Tracks key metrics about the site usage
  - Number of users
  - Revenue (filter out test transactions)
  - Top 10 most active users
  - Query count by day (equivalent to API calls per day)
  - Size of cache DB
  - Failed log in attempts (perhaps because PUBLIC=FALSE has been set)

## Growth strategy

**Visisibility**

- Admin dashboard with key stats
- Cacheeviction
  - Have a parameter `cache_age_days` that limits how many days cached items float around for. Set to 28 days to start with.
  - Have a parameter `cache_visible_days` that limits how many days the cache is visible for. Set to 7 days to start with.

**Reliability**

- Cache needs concurrent writes, connection pooling and horizontal scaling
- HotCache to serve up results for top 20 routes super fast
- Structured logging for debuggin
- Sentry for error tracking
- Versioning - show the commit hash from github on the site in the footer
- Updating code can never wipe or alter the cache

**Scale**

- Rate limiting per user (not just per IP)
- Queue system for handling concurrency of API calls
- Database read replicas
- CDN for frontend assets (Cloudflare, Vercel)

**Security**

- No `.env` variables in github
- Cache is not shared between local <-> github <-> railway

## Limitations

- No multi leg or return journeys at this stage
