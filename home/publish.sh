#!/bin/bash
source ../local.env

# POST https://slack.com/api/views.publish
# Content-type: application/json
# Authorization: Bearer YOUR_TOKEN_HERE

curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $SLACK_BOT_TOKEN" -d @home_block.json https://slack.com/api/views.publish
