#!/usr/bin/env node

import { Client } from '@notionhq/client'
import { markdownToBlocks } from '@tryfabric/martian'

if (process.argv.length < 4) {
  console.error('Usage: node property-to-content.js <database-id> <property> [--remove]')
  process.exit(1)
}

const token = process.env.NOTION_TOKEN

if (!token) {
  console.error('Missing NOTION_TOKEN in environment')
  process.exit(1)
}

const id = process.argv[2]
const property = process.argv[3]
const remove = process.argv[4] === '--remove'

const notion = new Client({
  auth: token
})

async function * paginate (method, params) {
  const result = await method(params)

  yield result

  if (result.next_cursor) {
    yield * paginate(method, { ...params, start_cursor: result.next_cursor })
  }
}

async function processPage (page) {
  if (!page.properties[property]) {
    return
  }

  const richText = page.properties[property].rich_text

  if (!richText || richText.length < 1) {
    return
  }

  let children = richText

  // Single text node, try to parse it
  if (richText.length === 1) {
    children = markdownToBlocks(richText[0].plain_text)
  }

  const title = page.properties.Name.title[0].plain_text

  await notion.blocks.children.append({
    block_id: page.id,
    children
  })

  if (remove) {
    notion.pages.update({
      page_id: page.id,
      properties: {
        [property]: {
          rich_text: []
        }
      }
    })
  }

  console.log(`Processed: ${title}`)
}

const iterator = paginate(notion.databases.query, { database_id: id })

for await (const query of iterator) {
  for (const page of query.results) {
    await processPage(page)
  }
}
