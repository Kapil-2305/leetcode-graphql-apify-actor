# LeetCode GraphQL Data Extractor (Apify Actor)

This Apify actor extracts data from LeetCode by running targeted GraphQL queries directly against the `https://leetcode.com/graphql/` endpoint.

## What it does
- Includes a catalog of over 70+ LeetCode GraphQL operations (from user profiles to question details).
- Allows you to select **exactly which query** you want to run from a dropdown.
- Accepts specific input parameters (like `username` or `titleSlug`) to customize the query.
- Extracts the exact data requested and saves the raw JSON payload to the Apify dataset.

## How to use

1. **Select an Operation**: Choose the query you want to execute (e.g., `userPublicProfile`, `questionTitle`, `submissionList`).
2. **Provide Variables**: Provide the corresponding inputs for that query.
   - Example 1: If querying `userPublicProfile`, enter a valid LeetCode `username`.
   - Example 2: If querying `questionTitle`, enter the `titleSlug` (e.g., `two-sum`).
3. **Run the Actor**: The actor will fetch the data and push it into the dataset.

## Local Development
1. Install dependencies:
   - `npm install`
2. Configure your inputs in `storage/key_value_stores/default/INPUT.json`.
3. Run the actor:
   - `npm start`

### Example `INPUT.json`
To extract the profile of a specific user:
```json
{
  "operationName": "userPublicProfile",
  "username": "kapil-2305"
}
```

To extract a question's details:
```json
{
  "operationName": "questionTitle",
  "titleSlug": "two-sum"
}
```

## Output
The result is pushed to the default dataset and includes:
- The `operationName` and `variables` used.
- The `data` property containing the raw JSON response from LeetCode.
- Execution status and timings.
