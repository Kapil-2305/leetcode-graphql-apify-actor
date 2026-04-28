# LeetCode GraphQL Data Extractor (Apify Actor)

This actor runs a catalog of LeetCode GraphQL operations against `https://leetcode.com/graphql/` and extracts data directly into an Apify dataset.

## What it does
- Loads over 70+ GraphQL operations from `src/queries.json`.
- Sends GraphQL requests to extract detailed information such as question metadata, user public profiles, language stats, active daily coding challenges, and more.
- Captures HTTP status, GraphQL errors, timing, and the actual extracted data.
- Stores:
  - Dataset items (one result per query executed containing the `data` payload)
  - `EXTRACTION_SUMMARY` in key-value store
  - `EXTRACTION_RESULTS` in key-value store

## Local run
1. Install dependencies:
   - `npm install`
2. Run with defaults:
   - `npm start`
3. Optional: Provide actor input via `INPUT.json` in the project root to control exactly which data to extract.

## Input highlights
- `includeOperationNames`: An array of specific operations to run. If not provided, all 75+ queries will be executed.
- `variablesOverrides`: An object allowing you to override the default variables for specific operations. This is useful for passing your own username or a specific question slug.
- `includeSourcePaths`: Run a specific source group only.
- `runAllVariableExamples`: Run all examples per operation instead of just the first one.
- `headers`: Inject auth/csrf headers for protected mutations or restricted data.

## Example `INPUT.json`
To extract the title and details of the question "3sum" and the profile of a user:

```json
{
  "includeOperationNames": [
    "questionTitle",
    "userPublicProfile"
  ],
  "variablesOverrides": {
    "questionTitle": {
      "titleSlug": "3sum"
    },
    "userPublicProfile": {
      "username": "your_username_here"
    }
  }
}
```

## Output
- **Dataset**: One item per operation check with the full extracted payload stored in the `data` property.
- **`EXTRACTION_SUMMARY`**: Overall counts and filters used.
- **`EXTRACTION_RESULTS`**: Full result list.
