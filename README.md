## Filter Factory
- Create custom filters for use with OneSignal API's `filters` [parameter](https://documentation.onesignal.com/reference/create-message#filters).

### Definitions
- Filters: Individual rules that can be used together to create complex logic
- Conditions: A set of filters that define a "rule" which should include a certain subset of users when sending.
**Example:** To target users in the US with the data tag `level` greater than 10, you would create a condition with two filters:

### Features
- Filter creator sidebar
    - Dynamically populated relation & parameter options based on what each `field` supports
    - Option to create multiple conditions within a single group, or create new groups
- Visual filter builder
    - Add/Remove filters & conditions for clarity on complex filters
    - Visually show logic surrounding filters that can exist within the same group
- Type or Paste JSON to see your filters visually
    - Copy to clipboard
    - Inline error handling and Error Message
        - Auto scroll to error and emphasize line to update
    ![JSON Error Handling](/images/JSON_error.png)

### Usage
- [Filter Factory](https://dombartenope.github.io/FilterFactory)

