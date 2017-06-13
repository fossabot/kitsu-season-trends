import rp from 'request-promise'
import low from 'lowdb'
import mean from 'weighted-mean'
import { season, year } from '../src/season'

const version = 'edge'
const base = `https://kitsu.io/api/${version}`

const q = {
  // 20 results per request
  limit: 'page[limit]=20',
  // Currently airing tv and min userCount of 10
  filter: 'filter[status]=current&filter[subtype]=tv&filter[userCount]=10..',
  // Sort by highest rated then most users
  sort: 'sort=-averageRating,-userCount',
  fields: 'fields[anime]=slug,canonicalTitle,ratingFrequencies,userCount,favoritesCount,posterImage'
}

// Load season database
const db = low(`./data/${year()}-${season()}.json`)

// Set defaults if new season
db.defaults({ data: {} }).write()

function display (count, processed, offset) {
  if (offset + 20 > count) offset = count
  console.log(`${processed + offset} - ${(offset / count * 100).toFixed(1)}% Complete`)
}

async function get (path, offset) {
  return JSON.parse(await rp(`${base}/${path}?page[offset]=${offset}&${q.limit}&${q.filter}&${q.sort}&${q.fields}`))
}

async function add (id, attributes) {
  const ratings = Object.keys(attributes.ratingFrequencies).map(k => [k / 2, +attributes.ratingFrequencies[k]])

  if (db.get('data').find({ id }).value() !== undefined) {
    db.get(`data.${id}.mean`).push(
      +mean(ratings).toFixed(2) || 0 // Changing 0 (no ratings) to null is ideal
    ).write()
  }
  else {
    // Update media metadata
    db.set(`data.${id}`, {
      id,
      slug: attributes.slug,
      title: attributes.canonicalTitle,
      users: attributes.userCount,
      favorites: attributes.favoritesCount,
      poster: attributes.posterImage.medium,
      mean: [+mean(ratings).toFixed(2) || 0] // Changing 0 (no ratings) to null is ideal
    }).write()
  }
}

(async function main (offset) {
  const { data, meta, links } = await get('anime', offset)
  for (let item of await data) {
    await add(item.id, item.attributes)
  }
  display(meta.count, data.length, offset)
  if (links.next) await main(offset + 20)
})(0)
