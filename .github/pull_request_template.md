# Changes

COMMITS=$(git log origin/main..HEAD --pretty=format:"- %s")

BODY=$(cat .github/pull_request_template.md)

BODY="${BODY/<!-- commits go here -->/$COMMITS}"

gh pr create --body "$BODY"

## extra notes
